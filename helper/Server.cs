using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Automation;

namespace MK {
 public static class Server {
  public const string Version="0.5.4";
  static volatile InputLayoutSession Layouts=new InputLayoutSession();
  static readonly InputArbiter Human=new InputArbiter();static long actionGeneration;
  static readonly object Sync=new object(),Output=new object(),CloseSync=new object();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024,RecursionLimit=40};
  static string nonce,run,path,stopReason;static int parent;static long epoch;static volatile bool workerBusy,closing;
  static volatile bool gate;static Dictionary<string,object> settings;static Snapshot last;
  static readonly ManualResetEventSlim WorkerDone=new ManualResetEventSlim(true);
  static readonly OwnedInputs Down=new OwnedInputs();static int sentEvents;
  static readonly BlockingCollection<Action> LeaseQueue=new BlockingCollection<Action>();static Mutex mutex;static bool lease;
  static long lastActivity;static bool shuttingDown;
  sealed class Snapshot {public Dictionary<string,object> Data;public IntPtr Hwnd,NativeFocus;public Native.RECT Rect;public uint Dpi;public long At,HumanGeneration;public Dictionary<string,AutomationElement> Elements;public AutomationElement Focus;public Native.VisualFrame Frame;}
  public static bool InputAllowed {get{return gate&&!shuttingDown;}}
  public static bool ShouldHideIdle(bool open,bool busy,bool visible,long idleMs){return open&&!busy&&visible&&idleMs>10000;}
  public static bool CanHideIdleNow {get{return ShouldHideIdle(gate,workerBusy,Overlay.Visible,Now()-Interlocked.Read(ref lastActivity));}}
  static long Now(){return Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency;}
  // FR-01: extra settle wait after delivery; returns the actual elapsed milliseconds.
  static void Pause(int requested,Action guard){guard();if(requested<=0)return;var watch=Stopwatch.StartNew();using(var timer=new Native.InputTimer()){for(;;){guard();int remaining=requested-(int)watch.ElapsedMilliseconds;if(remaining<=0)return;timer.Slice(Math.Min(10,remaining));}}}
  static void Settle(int requested,Action guard,out int elapsed){elapsed=0;if(requested<=0)return;var watch=Stopwatch.StartNew();try{Pause(requested,guard);}finally{elapsed=(int)watch.ElapsedMilliseconds;}}
  static readonly string[] RetryableCodes={"STATE_CHANGED","FOCUS_MISMATCH","OCCLUDED_TARGET","STALE_SNAPSHOT","USER_BUSY","INPUT_INTERFERENCE","INVALID_COORDINATE","ELEMENT_NOT_FOUND"};
  static readonly string[] StopCodes={"USER_STOPPED","CONTROL_CLOSE_FAILED","PROTOCOL_ERROR","HELPER_TIMEOUT"};
  static readonly string[] RebeginCodes={"CONTROL_CLOSED","TARGET_CHANGED","CONFIG_UNAVAILABLE"};
  // One shared recovery table (FR-05, interface note section 0); mirrors contracts.recovery().
  // retryable is only ever true for a not_sent failure with a transient code: a failure
  // after the first successful SendInput can never be replayed.
  static void Recovery(Dictionary<string,object> receipt){
   string execution=(string)receipt["execution"],verification=(string)receipt["verification"];string code=receipt.ContainsKey("error")?(string)Native.Obj(receipt["error"])["code"]:null;
   bool retryable=false;string action;
   if(code!=null&&StopCodes.Contains(code))action="stop";
   else if(execution!="not_sent"){
    if(code==null&&(verification=="verified"||verification=="observed_change"))action="none";
    else if(execution=="unknown"&&code==null)action="wait";
    else action="reobserve";
   }else if(code!=null&&RebeginCodes.Contains(code))action="rebegin";
   else{retryable=code!=null&&RetryableCodes.Contains(code);action=code!=null?"reobserve":"none";}
   receipt["retryable"]=retryable;receipt["requiredAction"]=action;
  }
  static void Write(object value){lock(Output){var json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024,RecursionLimit=40}.Serialize(value);if(System.Text.Encoding.UTF8.GetByteCount(json)>4*1024*1024)throw new Failure("OUTPUT_LIMIT");Console.Out.WriteLine(json);Console.Out.Flush();}}
  static object Result(Dictionary<string,object> req,object value){return Native.D("protocol",1,"nonce",nonce,"id",req["id"],"run",req["run"],"ok",true,"value",value);}
  static object Error(Dictionary<string,object>req,Failure e){var error=Native.D("code",e.Code,"execution",e.Execution,"details",e.Details??Native.D("stage","native-validation","check",e.Code.ToLowerInvariant().Replace('_','-')));return Native.D("protocol",1,"nonce",nonce,"id",req["id"],"run",req["run"],"ok",false,"error",error);}
  public static void PhysicalKey(int key,bool down,bool injected){if(Human.Key(key,down,injected,Now()))UserStop("USER_STOPPED");}
  public static void PhysicalMouse(int message,bool injected){Human.Mouse(message,injected,Now());}
  static void UserQuiet(long generation){if(!Human.CanSend(generation,Now()))throw new Failure("USER_BUSY","not_sent",Native.D("stage","input-arbitration","check","human-activity-changed","requiredAction","reobserve"));}
  static void Check(string requested){if(!gate||run!=requested)throw new Failure(stopReason??"CONTROL_CLOSED");}
  static void Lease(Action action){Exception failure=null;var done=new ManualResetEventSlim(false);LeaseQueue.Add(delegate(){try{action();}catch(Exception e){failure=e;}finally{done.Set();}});if(!done.Wait(2000))throw new Failure("CONTROL_CLOSE_FAILED");if(failure!=null)throw failure;}
  static void Acquire(){Lease(delegate(){if(lease)return;try{if(!mutex.WaitOne(0))throw new Failure("BUSY");}catch(AbandonedMutexException){}lease=true;});}
  static void Release(){Lease(delegate(){if(lease){mutex.ReleaseMutex();lease=false;}});}
  static int Setting(string name){return Convert.ToInt32(settings[name]);}
  static void ReadSettings(Dictionary<string,object> s){
   Native.Exact(s,"enabled","snapshotTtlMs","controlIdleMs","screenshotMaxWidth","screenshotMaxHeight","maxElements","maxTreeDepth","diagnosticsEnabled","humanizeEnabled","humanizeProfile","typoRate");
   if(!s.ContainsKey("enabled")||!(s["enabled"] is bool)||!(bool)s["enabled"])throw new Failure("CONFIG_UNAVAILABLE");
   if(s.ContainsKey("humanizeEnabled")&&!(s["humanizeEnabled"] is bool))throw new Failure("INVALID_ARGUMENT");
   if(s.ContainsKey("humanizeProfile")&&(!Object.Equals(s["humanizeProfile"],"natural")&&!Object.Equals(s["humanizeProfile"],"slow")))throw new Failure("INVALID_ARGUMENT");
   if(s.ContainsKey("typoRate")){object value=s["typoRate"];if(!(value is int||value is long||value is double||value is decimal)||Double.IsNaN(Convert.ToDouble(value))||Convert.ToDouble(value)<0||Convert.ToDouble(value)>5)throw new Failure("INVALID_ARGUMENT");}
   Native.I(s,"snapshotTtlMs",1000,60000);Native.I(s,"controlIdleMs",60000,900000);Native.I(s,"screenshotMaxWidth",640,1600);Native.I(s,"screenshotMaxHeight",480,1200);Native.I(s,"maxElements",50,300);Native.I(s,"maxTreeDepth",3,10);settings=s;
  }
  public static void Run(int parentPid,string asset){
   parent=parentPid;path=asset;
   var leaseThread=new Thread(delegate(){var sid=WindowsIdentity.GetCurrent().User.Value;mutex=new Mutex(false,"Local\\MouseKeyboardPlugin-"+sid);foreach(var action in LeaseQueue.GetConsumingEnumerable())action();});leaseThread.IsBackground=true;leaseThread.Start();
   Process host;try{host=Process.GetProcessById(parent);}catch{return;}
   using(var watcher=new Timer(delegate(object unused){try{if(host.HasExited){shuttingDown=true;gate=false;try{CloseRun(run);}catch{}Environment.Exit(0);}else{ExpireIdle();if(ShouldHideIdle(gate,workerBusy,Overlay.Visible,Now()-Interlocked.Read(ref lastActivity)))Overlay.HideIdle();}}catch{}},null,1000,1000)) {
    for(;;){string line=ReadLineBounded();if(line==null)break;Dictionary<string,object> req;
     try{req=Native.Obj(Json.DeserializeObject(line));Native.Exact(req,"protocol","nonce","id","run","method","params");if(Native.I(req,"protocol",1,1)!=1)throw new Failure("PROTOCOL_ERROR");var nextNonce=Native.S(req,"nonce");if(nonce==null)nonce=nextNonce;if(nonce!=nextNonce||nextNonce.Length>80||Native.S(req,"id").Length>80||Native.S(req,"run").Length>80)throw new Failure("PROTOCOL_ERROR");Native.Obj(req["params"]);}catch{gate=false;break;}
     var method=Native.S(req,"method");
     if(method=="end") {var captured=req;try{lock(Sync){if(run!=null&&run!=Native.S(req,"run"))throw new Failure("NOT_AUTHORIZED");gate=false;closing=true;epoch++;last=null;}}catch(Failure e){Write(Error(req,e));continue;}Task.Run(delegate(){try{Write(Result(captured,CloseRun(Native.S(captured,"run"))));}catch(Failure e){Write(Error(captured,e));}catch{Write(Error(captured,new Failure("CONTROL_CLOSE_FAILED","unknown")));}});continue;}
     if(method=="status"){Write(Result(req,Native.D("inputReady",gate,"overlayVisible",Overlay.Visible,"pendingInputs",workerBusy?1:0,"inputLayout",Layouts.Snapshot())));continue;}
     lock(Sync){if(workerBusy||closing){Write(Error(req,new Failure(closing?"CONTROL_CLOSING":"BUSY")));continue;}workerBusy=true;WorkerDone.Reset();if(method=="begin"){if(run!=null){workerBusy=false;WorkerDone.Set();Write(Error(req,new Failure("BUSY")));continue;}run=Native.S(req,"run");}}
     var request=req;Task.Run(delegate(){try{var answer=Dispatch(request);var facts=answer as Dictionary<string,object>;bool useful=method!="act"||facts==null||!facts.ContainsKey("error")||!Object.Equals(facts["execution"],"not_sent");lock(Sync){if(useful&&gate&&run==Native.S(request,"run"))lastActivity=Now();}Write(Result(request,answer));}catch(Failure e){Write(Error(request,e));}catch{Write(Error(request,new Failure(method=="act"?"INPUT_UNKNOWN":"OBSERVE_FAILED",method=="act"?"unknown":"not_sent")));}finally{lock(Sync){workerBusy=false;WorkerDone.Set();}}});
    }
   }
   shuttingDown=true;gate=false;try{CloseRun(run);}catch{}try{Overlay.Dispose();}catch{}LeaseQueue.CompleteAdding();host.Dispose();
  }
  static void ExpireIdle(){
   string current;lock(Sync){if(!gate||run==null||workerBusy||closing||settings==null||Now()-lastActivity<Setting("controlIdleMs"))return;current=run;gate=false;closing=true;epoch++;last=null;}
   Task.Run(delegate(){try{CloseRun(current);Write(Native.D("protocol",1,"nonce",nonce,"event","stop","run",current,"reason","IDLE_CLOSED"));}catch{}});
  }
  static string ReadLineBounded(){var b=new System.Text.StringBuilder();int bytes=0;for(;;){int c=Console.In.Read();if(c<0)return b.Length==0?null:b.ToString();if(c==10)return b.ToString().TrimEnd('\r');b.Append((char)c);bytes+=c<128?1:c<2048?2:3;if(bytes>256*1024)throw new Failure("PROTOCOL_ERROR");}}
  static object Dispatch(Dictionary<string,object> req){
   string method=Native.S(req,"method"),r=Native.S(req,"run");var p=Native.Obj(req["params"]);Native.SetThreadDpiAwarenessContext(new IntPtr(-4));
   if(method=="begin") {
    Native.Exact(p,"settings");ReadSettings(Native.Obj(p["settings"]));Native.Dpi();Native.Desktop();Acquire();
    try{Overlay.Start(path);Human.Reset();Overlay.EnableHooks();lock(Sync){if(closing)throw new Failure("CONTROL_CLOSING");run=r;stopReason=null;last=null;Layouts=new InputLayoutSession();gate=true;epoch++;lastActivity=Now();}return Native.D("protocol",1,"version",Version,"inputReady",true,"dpi",true,"uia",true,"overlay",true);}catch{Overlay.Close();Release();throw;}
   }
   Check(r);
   if(method=="targets"){Native.Exact(p,"query","aliases");string q=p.ContainsKey("query")?Native.S(p,"query"):null;if(q!=null&&(q.Length==0||q.Length>256))throw new Failure("INVALID_ARGUMENT");string[] aliases=null;if(p.ContainsKey("aliases")){var a=p["aliases"] as object[];if(a==null||a.Length>8||a.Any(v=>!(v is string)||((string)v).Length<1||((string)v).Length>128))throw new Failure("INVALID_ARGUMENT");aliases=a.Cast<string>().ToArray();}return Native.Targets(q,parent,aliases);}
   bool includeImage=true;if(p.ContainsKey("includeImage")){if(!(p["includeImage"] is bool))throw new Failure("INVALID_ARGUMENT");includeImage=(bool)p["includeImage"];}
   if(method=="observe"){Native.Exact(p,"window","includeImage","detail","savePath","region","waitFor");string detail=p.ContainsKey("detail")?Native.S(p,"detail"):"compact";if(detail!="compact"&&detail!="expanded")throw new Failure("INVALID_ARGUMENT");string savePath=p.ContainsKey("savePath")?Native.S(p,"savePath"):null;Native.RECT? region=null;if(p.ContainsKey("region"))region=Native.ImageRect(Native.Obj(p["region"]));Dictionary<string,object> waitFor=null;if(p.ContainsKey("waitFor"))waitFor=WaitSpec(Native.Obj(p["waitFor"]));var window=Native.Obj(p["window"]);if(waitFor!=null)return WaitObserve(window,r,includeImage,savePath,region,waitFor,detail);return Native.CompactObservation(Observe(window,r,true,includeImage,savePath,region),detail=="expanded");}
   if(method=="act"){Native.Exact(p,"window","observation","request","includeImage");var result=Act(Native.Obj(p["window"]),Native.Obj(p["observation"]),Native.Obj(p["request"]),r,includeImage);if(result.ContainsKey("observation")&&result["observation"]!=null)result["observation"]=Native.CompactObservation(Native.Obj(result["observation"]));return result;}
   throw new Failure("PROTOCOL_ERROR");
  }
  static Dictionary<string,object> CloseRun(string requested){
   lock(CloseSync){
   lock(Sync){if(run!=null&&run!=requested)throw new Failure("NOT_AUTHORIZED");gate=false;epoch++;last=null;closing=true;}
   try{
    if(!WorkerDone.Wait(1800)){try{ReleaseOwned();}catch{}throw new Failure("CONTROL_CLOSE_FAILED","unknown");}
    try{ReleaseOwned();}finally{Overlay.Close();}Release();
    lock(Sync){run=null;}return Native.D("inputReleased",true,"overlayVisible",false,"pendingInputs",0,"inputLayout",Layouts.Finish());
   }finally{try{Overlay.Close();}catch{}lock(Sync){closing=false;}}
   }
  }
  public static void UserStop(string reason){
   // Low-level hooks must never wait for a lock, pipe, UI operation or SendInput.
   if(!gate)return;gate=false;stopReason=reason;Interlocked.Increment(ref epoch);string old=run;
   Task.Run(delegate(){lock(Sync){if(run==old)last=null;}try{Write(Native.D("protocol",1,"nonce",nonce,"event","stop","run",old,"reason",reason));}catch{}try{CloseRun(old);}catch{}});
  }
  static void Walk(AutomationElement node,int depth,ref int budget,List<Dictionary<string,object>> entries,Dictionary<string,AutomationElement> objects,Stopwatch time,ref bool truncated,Dictionary<string,object> focus){
   if(node==null)return;if(depth>Setting("maxTreeDepth")||entries.Count>=Setting("maxElements")||time.ElapsedMilliseconds>800){truncated=true;return;}
   try{if(!node.Current.IsOffscreen){bool isFocus=focus!=null&&Object.Equals(focus["runtimeId"],Native.RuntimeId(node));var reference=isFocus?(string)focus["ref"]:Guid.NewGuid().ToString();var e=isFocus?focus:Native.Element(node,reference,ref budget);if(Native.HasRect(e)){entries.Add(e);objects[reference]=node;}}
    var child=TreeWalker.ControlViewWalker.GetFirstChild(node);if(depth<Setting("maxTreeDepth")){while(child!=null&&entries.Count<Setting("maxElements")&&time.ElapsedMilliseconds<800){Walk(child,depth+1,ref budget,entries,objects,time,ref truncated,focus);child=TreeWalker.ControlViewWalker.GetNextSibling(child);}if(child!=null)truncated=true;}else if(child!=null)truncated=true;
   }catch(ElementNotAvailableException){truncated=true;}catch(InvalidOperationException){truncated=true;}
  }
  static Dictionary<string,object> Observe(Dictionary<string,object>w,string r,bool activate,bool includeImage=true,string savePath=null,Native.RECT? region=null,Native.RECT? saveRegion=null){
   for(int attempt=0;attempt<2;attempt++){
    Check(r);Overlay.Stage("DSH 正在确认");var h=Native.ValidateWindow(w,parent,false,activate);
    if(activate){
     long generation=Human.Generation;
     Action guard=delegate(){Check(r);UserQuiet(generation);Native.NoHeldInputs();Native.ValidateWindow(w,parent,false,true);};
     try{Foreground.Bring(new WindowsForegroundPlatform(),h,guard);}catch(Failure failure){if(failure.Code=="CONTROL_CLOSE_FAILED")UserStop("HELPER_FAILED");throw;}
    }else Native.ValidateWindow(w,parent,true);
    if(activate){long layoutGeneration=Human.Generation;Action layoutGuard=delegate(){Check(r);UserQuiet(layoutGeneration);Native.NoHeldInputs();};Layouts.Ensure(LayoutPlatform(w,r,layoutGeneration),layoutGuard);}
    long humanGeneration=Human.Generation;
    Check(r);Native.ValidateWindow(w,parent,true);var watch=Stopwatch.StartNew();var rect=Native.GetRect(h);var dpi=Native.GetDpiForWindow(h);
    var entries=new List<Dictionary<string,object>>();var refs=new Dictionary<string,AutomationElement>();int budget=16000;bool truncated=false;
    AutomationElement focus=null;Dictionary<string,object> focused=null;IntPtr nativeFocus=IntPtr.Zero;
    try{nativeFocus=Native.ForegroundFocus(h);focus=AutomationElement.FocusedElement;if(Native.BelongsToWindow(focus,h,Convert.ToInt32(w["pid"]))){
     string reference=Guid.NewGuid().ToString();focused=Native.Element(focus,reference,ref budget);if(Native.HasRect(focused)&&!focus.Current.IsOffscreen)refs[reference]=focus;else{focused=null;focus=null;}
    }else focus=null;}catch{focus=null;focused=null;nativeFocus=IntPtr.Zero;}
    budget=2048;Walk(AutomationElement.FromHandle(h),0,ref budget,entries,refs,watch,ref truncated,focused);
    if(focused!=null&&!entries.Any(e=>Object.Equals(e["ref"],focused["ref"]))){if(entries.Count>=Setting("maxElements")){refs.Remove((string)entries[entries.Count-1]["ref"]);entries.RemoveAt(entries.Count-1);truncated=true;}entries.Insert(0,focused);}
    Native.ObservationBudget(watch.ElapsedMilliseconds,"uia",Native.UiaBudgetMs);long uiaMs=watch.ElapsedMilliseconds,captureMs=0,encodeMs=0;
    Native.RECT capture,captureOut;Dictionary<string,object> encoded,imageSize;Native.VisualFrame frame;
    Overlay.Suspend();byte[] savedPng=null;int savedWidth=0,savedHeight=0;
    try{using(var bitmap=Native.Capture(h,out capture)){
     frame=Native.Frame(bitmap,capture,Native.NativeCaret(h,capture,dpi));captureMs=watch.ElapsedMilliseconds-uiaMs;long encodingAt=watch.ElapsedMilliseconds;
     captureOut=capture;imageSize=Native.ImageSize(bitmap,Setting("screenshotMaxWidth"),Setting("screenshotMaxHeight"));
     int deliveredWidth=Convert.ToInt32(imageSize["width"]),deliveredHeight=Convert.ToInt32(imageSize["height"]);Bitmap deliver=bitmap;
     try{
      if(region.HasValue){Native.Within(region.Value,deliveredWidth,deliveredHeight);captureOut=Native.Physical(capture,deliveredWidth,deliveredHeight,region.Value);deliver=Native.CropDelivered(bitmap,deliveredWidth,deliveredHeight,region.Value);imageSize=Native.D("width",deliver.Width,"height",deliver.Height);}
      encoded=includeImage?(region.HasValue?Native.Encoded(deliver,deliver.Width,deliver.Height):Native.Encoded(bitmap,Setting("screenshotMaxWidth"),Setting("screenshotMaxHeight"))):Native.D("imageSize",imageSize,"png","");
      encodeMs=watch.ElapsedMilliseconds-encodingAt;
      if(savePath!=null){Bitmap saved=deliver;if(!region.HasValue&&saveRegion.HasValue){Native.Within(saveRegion.Value,deliveredWidth,deliveredHeight);saved=Native.CropDelivered(bitmap,deliveredWidth,deliveredHeight,saveRegion.Value);}try{savedPng=Native.PngBytes(saved);savedWidth=saved.Width;savedHeight=saved.Height;}finally{if(saved!=deliver)saved.Dispose();}}
     }finally{if(deliver!=bitmap)deliver.Dispose();}
    }}finally{Overlay.Resume();}
    Check(r);Native.ValidateWindow(w,parent,true);if(Human.Generation!=humanGeneration)throw new Failure("USER_BUSY","not_sent",Native.D("stage","observation","check","human-activity-changed","requiredAction","reobserve"));watch.Stop();Native.ObservationBudget(watch.ElapsedMilliseconds,"capture",Native.ObservationBudgetMs);if(!Native.SameRect(rect,Native.GetRect(h))||Native.GetDpiForWindow(h)!=dpi){if(attempt==0)continue;throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","observation","check","capture-inconsistent","dpi",dpi));}
    bool textTruncated=entries.Any(e=>e.ContainsKey("valueTruncated")||e.ContainsKey("valueUnavailable"));
    var data=Native.D("window",Native.Window(h,parent),"captureRect",Native.Rect(captureOut),"imageSize",encoded["imageSize"],"png",encoded["png"],"elements",entries.ToArray(),"fingerprint",frame.Hash,"capturedAt",DateTime.UtcNow.ToString("o"),"durationMs",watch.ElapsedMilliseconds,"coverage",Native.D("truncated",truncated,"textTruncated",textTruncated),"warnings",new string[0],"inputLayout",Layouts.Snapshot());
    if(focused!=null)data["focusedElement"]=focused;if(savedPng!=null)data["saved"]=Native.WritePng(savedPng,savePath,savedWidth,savedHeight);
    data["timings"]=Native.D("uiaMs",uiaMs,"captureMs",captureMs,"encodeMs",encodeMs,"totalMs",watch.ElapsedMilliseconds);data["imageEncoded"]=includeImage;
    lock(Sync){Check(r);last=new Snapshot{Data=data,Hwnd=h,Rect=rect,Dpi=dpi,At=Now(),HumanGeneration=humanGeneration,Elements=refs,Focus=focus,NativeFocus=nativeFocus,Frame=frame};}Overlay.Stage("DSH 等待下一步");return data;
   }throw new Failure("STATE_CHANGED");
  }
  static Dictionary<string,object> WaitSpec(Dictionary<string,object> raw){
   string kind=Native.S(raw,"kind");
   if(kind=="text"){Native.Exact(raw,"kind","value","exact","timeoutMs");string value=Native.S(raw,"value");if(value.Length<1||value.Length>256)throw new Failure("INVALID_ARGUMENT");if(raw.ContainsKey("exact")&&!(raw["exact"] is bool))throw new Failure("INVALID_ARGUMENT");if(raw.ContainsKey("timeoutMs"))Native.I(raw,"timeoutMs",1000,30000);return raw;}
   if(kind=="element"){Native.Exact(raw,"kind","value","role","exact","timeoutMs");string value=Native.S(raw,"value");if(value.Length<1||value.Length>256)throw new Failure("INVALID_ARGUMENT");if(raw.ContainsKey("role")){string role=Native.S(raw,"role");if(role.Length<1||role.Length>64)throw new Failure("INVALID_ARGUMENT");}if(raw.ContainsKey("exact")&&!(raw["exact"] is bool))throw new Failure("INVALID_ARGUMENT");if(raw.ContainsKey("timeoutMs"))Native.I(raw,"timeoutMs",1000,30000);return raw;}
   if(kind=="pixel"){Native.Exact(raw,"kind","region","mode","settleSamples","minChangedPixels","timeoutMs");string mode=Native.S(raw,"mode");if(mode!="stable"&&mode!="changed")throw new Failure("INVALID_ARGUMENT");Native.ImageRect(Native.Obj(raw["region"]));if(raw.ContainsKey("settleSamples"))Native.I(raw,"settleSamples",2,10);if(raw.ContainsKey("minChangedPixels"))Native.I(raw,"minChangedPixels",1,4096);if(raw.ContainsKey("timeoutMs"))Native.I(raw,"timeoutMs",1000,30000);return raw;}
   throw new Failure("INVALID_ARGUMENT");
  }
  static Native.VisualFrame FrameOf(IntPtr h,uint dpi,out Native.RECT capture){Native.VisualFrame frame;Overlay.Suspend();try{using(var bitmap=Native.Capture(h,out capture))frame=Native.Frame(bitmap,capture,Native.NativeCaret(h,capture,dpi));}finally{Overlay.Resume();}return frame;}
  // FR-06 UIA sampling: focus-first bounded walk, no capture and no protocol effect.
  static Dictionary<string,object> UiaSample(Dictionary<string,object> w,string r){
   Check(r);var h=Native.ValidateWindow(w,parent,false);var watch=Stopwatch.StartNew();
   var entries=new List<Dictionary<string,object>>();var refs=new Dictionary<string,AutomationElement>();int budget=2048;bool truncated=false;
   AutomationElement focus=null;Dictionary<string,object> focused=null;
   try{focus=AutomationElement.FocusedElement;if(focus!=null&&!Native.BelongsToWindow(focus,h,Convert.ToInt32(w["pid"])))focus=null;
    if(focus!=null){string reference=Guid.NewGuid().ToString();var candidate=Native.Element(focus,reference,ref budget);if(Native.HasRect(candidate)&&!focus.Current.IsOffscreen)focused=candidate;else focus=null;}
   }catch{focus=null;focused=null;}
   budget=2048;Walk(AutomationElement.FromHandle(h),0,ref budget,entries,refs,watch,ref truncated,focused);
   if(focused!=null&&!entries.Any(e=>Object.Equals(e["ref"],focused["ref"])))entries.Insert(0,focused);
   return Native.D("elements",entries.ToArray(),"focusedElement",focused,"durationMs",watch.ElapsedMilliseconds);
  }
  static bool SampleMatches(Dictionary<string,object> sample,Dictionary<string,object> waitFor){
   string kind=Native.S(waitFor,"kind"),value=Native.S(waitFor,"value");bool exact=waitFor.ContainsKey("exact")&&Object.Equals(waitFor["exact"],true);
   var elements=(Dictionary<string,object>[])sample["elements"];
   if(kind=="element"){string role=waitFor.ContainsKey("role")?Native.S(waitFor,"role"):null;return Native.FindElements(elements,value,role,exact).Error==null;}
   foreach(var element in elements){if(Native.NameMatch(element.ContainsKey("name")?(string)element["name"]:null,value,exact))return true;if(element.ContainsKey("value")&&Native.NameMatch((string)element["value"],value,exact))return true;}
   var focused=sample.ContainsKey("focusedElement")?sample["focusedElement"] as Dictionary<string,object>:null;
   if(focused!=null&&(Native.NameMatch(focused.ContainsKey("name")?(string)focused["name"]:null,value,exact)||(focused.ContainsKey("value")&&Native.NameMatch((string)focused["value"],value,exact))))return true;
   return false;
  }
  // FR-06: poll every ~150 ms; a hit returns a fresh observation, a timeout returns the last
  // observation as ok:true with OBSERVATION_TIMEOUT (never a protocol error).
  static Dictionary<string,object> WaitObserve(Dictionary<string,object> w,string r,bool includeImage,string savePath,Native.RECT? region,Dictionary<string,object> waitFor,string detail){
   string kind=Native.S(waitFor,"kind");int timeoutMs=waitFor.ContainsKey("timeoutMs")?Native.I(waitFor,"timeoutMs",1000,30000):5000;long start=Now();bool matched=false;
   if(kind=="pixel"){
    string mode=Native.S(waitFor,"mode");int settleSamples=waitFor.ContainsKey("settleSamples")?Native.I(waitFor,"settleSamples",2,10):3;int minChangedPixels=waitFor.ContainsKey("minChangedPixels")?Native.I(waitFor,"minChangedPixels",1,4096):64;
    var waitRegion=Native.ImageRect(Native.Obj(waitFor["region"]));var h=Native.ValidateWindow(w,parent,false);uint dpi=Native.GetDpiForWindow(h);Native.RECT capture;var first=FrameOf(h,dpi,out capture);
    var size=Native.ImageSize(capture.Right-capture.Left,capture.Bottom-capture.Top,Setting("screenshotMaxWidth"),Setting("screenshotMaxHeight"));int deliveredWidth=Convert.ToInt32(size["width"]),deliveredHeight=Convert.ToInt32(size["height"]);Native.Within(waitRegion,deliveredWidth,deliveredHeight);
    var baseline=first;var window=new List<Native.VisualFrame>();window.Add(first);
    for(;;){
     Check(r);long now=Now();if(now>=start+timeoutMs)break;long pause=Math.Min(150,start+timeoutMs-now);if(pause>0)Thread.Sleep((int)pause);
     Check(r);h=Native.ValidateWindow(w,parent,false);dpi=Native.GetDpiForWindow(h);var sample=FrameOf(h,dpi,out capture);var physical=Native.Physical(capture,deliveredWidth,deliveredHeight,waitRegion);
     Native.PixelVerdict verdict;
     if(mode=="stable"){window.Add(sample);if(window.Count>Math.Max(2,settleSamples))window.RemoveAt(0);verdict=Native.PixelWait(window.ToArray(),physical,"stable",settleSamples,minChangedPixels);}
     else{verdict=Native.PixelWait(new[]{baseline,sample},physical,"changed",2,minChangedPixels);if(!Native.SameRect(baseline.Capture,sample.Capture))baseline=sample;}
     if(verdict.Matched){matched=true;break;}
    }
   }else{
    for(;;){
     Check(r);var sample=UiaSample(w,r);if(SampleMatches(sample,waitFor)){matched=true;break;}
     long now=Now();if(now>=start+timeoutMs)break;long pause=Math.Min(150,start+timeoutMs-now);if(pause>0)Thread.Sleep((int)pause);
    }
   }
   long waited=Now()-start;var post=Observe(w,r,true,includeImage,savePath,region);post["durationMs"]=waited;post["waitFor"]=Native.D("kind",kind,"matched",matched,"waitedMs",waited,"timeoutMs",timeoutMs);
   var data=Native.CompactObservation(post,detail=="expanded");
   if(!matched){data["execution"]="not_sent";data["verification"]="unverified";data["retryable"]=false;data["requiredAction"]="reobserve";data["error"]=Native.D("code","OBSERVATION_TIMEOUT","message","The wait condition did not hold before the timeout; observe the target again.","details",Native.D("stage","observation","check","wait-timeout","waitedMs",waited,"requiredAction","reobserve"));}
   return data;
  }
  static void Fresh(Snapshot snap,Dictionary<string,object>w,string r){
   Check(r);UserQuiet(snap.HumanGeneration);Native.ValidateWindow(w,parent,true);if(Now()-snap.At>Setting("snapshotTtlMs")||!Native.SameRect(snap.Rect,Native.GetRect(snap.Hwnd))||Native.GetDpiForWindow(snap.Hwnd)!=snap.Dpi)throw new Failure("STALE_SNAPSHOT","not_sent",Native.D("stage","snapshot","check","age-or-geometry","dpi",snap.Dpi,"snapshotAgeMs",Now()-snap.At));
  }
  static Dictionary<string,object> FreshContent(Snapshot snap,Dictionary<string,object>w){
   var before=Native.Obj(snap.Data["focusedElement"]);var after=RequireFocus(snap,w,true);
   if(before.ContainsKey("value")&&!before.ContainsKey("valueTruncated"))foreach(string key in new[]{"value","valueTruncated","selectionStart","selectionEnd"}){object a,b;if(before.TryGetValue(key,out a)!=after.TryGetValue(key,out b)||!Object.Equals(a,b))throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","focus-validation","check","editor-content-or-selection"));}return after;
  }
  static void Visual(Snapshot snap,Dictionary<string,object>w,Native.RECT region,bool checkContent=true){
   Dictionary<string,object> before=snap.Data.ContainsKey("focusedElement")?Native.Obj(snap.Data["focusedElement"]):null,after=null;
   if(checkContent&&before!=null){try{after=FreshContent(snap,w);}catch(Failure e){if(e.Code=="STATE_CHANGED")throw;}}
   Native.RECT capture;Native.VisualFrame frame;Overlay.Suspend();try{using(var b=Native.Capture(snap.Hwnd,out capture))frame=Native.Frame(b,capture,Native.NativeCaret(snap.Hwnd,capture,snap.Dpi));}finally{Overlay.Resume();}
   var comparison=Native.CompareFrame(snap.Frame,frame,before,after,snap.Dpi,region);comparison.Details["snapshotAgeMs"]=Now()-snap.At;if(!comparison.Passed)throw new Failure("STATE_CHANGED","not_sent",comparison.Details);
  }
  // F6: canvas coordinate clicks skip the focused-editor content check (the focused editor is
  // irrelevant to the image target) and retry a bounded 3 samples ~60 ms apart.
  static void VisualCanvas(Snapshot snap,Dictionary<string,object>w,Native.RECT region){
   Failure last=null;
   for(int attempt=0;attempt<3;attempt++){if(attempt>0)Thread.Sleep(60);try{Visual(snap,w,region,false);return;}catch(Failure failure){if(failure.Code!="STATE_CHANGED")throw;last=failure;}}
   throw last??new Failure("STATE_CHANGED","not_sent",Native.D("stage","visual-comparison","check","significant-target-change"));
  }
  static Dictionary<string,object> RequireFocus(Snapshot snap,Dictionary<string,object>w,bool readText=false,bool compareBounds=true){
   try{
    if(snap.Focus==null||!snap.Data.ContainsKey("focusedElement"))throw new Failure("FOCUS_MISMATCH");
    var before=Native.Obj(snap.Data["focusedElement"]);var live=AutomationElement.FocusedElement;var c=live.Current;
    bool same=Native.RuntimeId(live)==Native.S(before,"runtimeId"),native=Native.ForegroundFocus(snap.Hwnd)==snap.NativeFocus;
    int budget=readText?16000:0;var current=Native.Element(live,Native.S(before,"ref"),ref budget);
    if(c.IsPassword||(bool)before["password"])throw new Failure("PASSWORD_FIELD");
    if(!Native.FocusEvidence(same,native,Native.BelongsToWindow(live,snap.Hwnd,Convert.ToInt32(w["pid"])),c.IsEnabled&&!c.IsOffscreen,c.HasKeyboardFocus,(bool)current["editable"],c.IsKeyboardFocusable))throw new Failure("FOCUS_MISMATCH");
    if(!(compareBounds?Native.SameElementState(before,current):Native.SameElementIdentity(before,current)))throw new Failure("STATE_CHANGED");return current;
   }catch(Failure e){throw new Failure(e.Code,e.Execution,e.Details??Native.D("stage","focus-validation","check",e.Code.ToLowerInvariant().Replace('_','-')));}catch{throw new Failure("FOCUS_MISMATCH","not_sent",Native.D("stage","focus-validation","check","focus-unavailable"));}
  }
  static void Send(Native.INPUT[] inputs,string r){
   lock(Sync){Check(r);UserQuiet(actionGeneration);Native.NoHeldInputsExceptOwned(Down);Check(r);uint count=Native.SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Native.INPUT)));sentEvents+=(int)count;Down.Record(inputs,(int)count);if(count!=inputs.Length)throw new Failure("INPUT_PARTIAL",count==0?"not_sent":"partially_sent");}
  }
  static void ReleaseOwned(){lock(Sync){Down.Release(input=>Native.SendInput(1,new[]{input},Marshal.SizeOf(typeof(Native.INPUT))),Human.PhysicalHeld);}}
  static string HumanProfile(Dictionary<string,object> request){
   if(request.ContainsKey("humanize")){string explicitProfile=Native.S(request,"humanize");if(explicitProfile!="off"&&explicitProfile!="natural"&&explicitProfile!="slow")throw new Failure("INVALID_ARGUMENT");}
   if(settings.ContainsKey("humanizeEnabled")&&!Object.Equals(settings["humanizeEnabled"],true))return "off";
   if(request.ContainsKey("paceMs")&&Native.I(request,"paceMs",0,400)==0)return "off";
   return request.ContainsKey("humanize")?Native.S(request,"humanize"):settings.ContainsKey("humanizeProfile")?Native.S(settings,"humanizeProfile"):"natural";
  }
  // FR-07: locate by accessible name (+ optional exact role) inside the current snapshot's
  // element table. Matching itself is Native.FindElements so SelfTest executes the same code.
  static string ResolveElement(Snapshot snap,Dictionary<string,object> request){
   string name=Native.S(request,"elementName");if(name.Length<1||name.Length>256)throw new Failure("INVALID_ARGUMENT");
   string role=null;if(request.ContainsKey("elementRole")){role=Native.S(request,"elementRole");if(role.Length<1||role.Length>64)throw new Failure("INVALID_ARGUMENT");}
   bool exact=false;if(request.ContainsKey("elementExact")){object value=request["elementExact"];if(!(value is bool))throw new Failure("INVALID_ARGUMENT");exact=(bool)value;}
   var lookup=Native.FindElements((Dictionary<string,object>[])snap.Data["elements"],name,role,exact);
   if(lookup.Error=="ELEMENT_NOT_FOUND")throw new Failure("ELEMENT_NOT_FOUND","not_sent",Native.D("stage","element-validation","check","element-name","requiredAction","reobserve"));
   if(lookup.Error=="AMBIGUOUS_TARGET")throw new Failure("AMBIGUOUS_TARGET","not_sent",Native.D("stage","element-validation","check","element-ambiguous","candidates",lookup.Candidates.ToArray()));
   return (string)lookup.Matches[0]["ref"];
  }
  static WindowsInputLayoutPlatform LayoutPlatform(Dictionary<string,object> w,string r,long generation){return new WindowsInputLayoutPlatform(w,parent,action=>{lock(Sync){Check(r);UserQuiet(generation);Native.NoHeldInputs();Native.ValidateWindow(w,parent,true);Check(r);UserQuiet(generation);action();}},(ms,guard)=>Pause(ms,guard));}
  static Dictionary<string,object> Act(Dictionary<string,object>w,Dictionary<string,object>observation,Dictionary<string,object>request,string r,bool includeImage=true){
   Snapshot snap;lock(Sync){Check(r);snap=last;last=null;}if(snap==null||!Object.Equals(snap.Data["fingerprint"],observation["fingerprint"]))throw new Failure("STALE_SNAPSHOT");
   Native.Exact(observation,"fingerprint");
   string tool=Native.S(request,"tool"),action=Native.S(request,"action");if(tool!="mk_mouse"&&tool!="mk_keyboard")throw new Failure("INVALID_ARGUMENT");
   Native.Exact(request,"tool","action","target","snapshot","element","elementName","elementRole","elementExact","x","y","text","key","savePath","inputMode","settleMs","paceMs","observe","region","humanize","allowTypos");
   if(request.ContainsKey("allowTypos")&&(!(request["allowTypos"] is bool)||tool!="mk_keyboard"||action!="type"))throw new Failure("INVALID_ARGUMENT");
   string text=null,key=null;string savePath=request.ContainsKey("savePath")?Native.S(request,"savePath"):null;Native.POINT point=new Native.POINT();Dictionary<string,object>focused=snap.Data.ContainsKey("focusedElement")?Native.Obj(snap.Data["focusedElement"]):null;
   string inputMode=request.ContainsKey("inputMode")?Native.S(request,"inputMode"):"auto";if(inputMode!="auto"&&inputMode!="unicode"&&inputMode!="scancode")throw new Failure("INVALID_ARGUMENT");
   string observeAmount="full";if(request.ContainsKey("observe")){observeAmount=Native.S(request,"observe");if(observeAmount!="full"&&observeAmount!="compact"&&observeAmount!="none")throw new Failure("INVALID_ARGUMENT");}
   int settleMs=request.ContainsKey("settleMs")?Native.I(request,"settleMs",0,5000):0;int? paceMs=request.ContainsKey("paceMs")?(int?)Native.I(request,"paceMs",0,400):null;
   Native.RECT? saveRegion=null;if(request.ContainsKey("region")){saveRegion=Native.ImageRect(Native.Obj(request["region"]));var capturedSize=Native.Obj(snap.Data["imageSize"]);Native.Within(saveRegion.Value,Convert.ToInt32(capturedSize["width"]),Convert.ToInt32(capturedSize["height"]));}
   Fresh(snap,w,r);Native.NoHeldModifiers();actionGeneration=snap.HumanGeneration;AutomationElement clicked=null;Native.RECT targetBounds=snap.Frame.Capture;
   if(tool=="mk_mouse"){
    if(action!="click"||request.ContainsKey("text")||request.ContainsKey("key"))throw new Failure("INVALID_ARGUMENT");
    bool hasElement=request.ContainsKey("element"),hasName=request.ContainsKey("elementName");
    if(hasElement&&hasName)throw new Failure("INVALID_ARGUMENT");
    if(!hasName&&(request.ContainsKey("elementRole")||request.ContainsKey("elementExact")))throw new Failure("INVALID_ARGUMENT");
    if(hasName&&(request.ContainsKey("x")||request.ContainsKey("y")))throw new Failure("INVALID_ARGUMENT");
    string reference=hasElement?Native.S(request,"element"):hasName?ResolveElement(snap,request):null;
    if(reference!=null){
     if(request.ContainsKey("x")||request.ContainsKey("y"))throw new Failure("INVALID_ARGUMENT");AutomationElement element;if(!snap.Elements.TryGetValue(reference,out element))throw new Failure("STATE_CHANGED");int budget=0;var current=Native.Element(element,reference,ref budget);var old=((Dictionary<string,object>[])snap.Data["elements"]).FirstOrDefault(e=>(string)e["ref"]==reference);
     if(old==null||!Native.SameElementState(old,current)||!(bool)current["enabled"]||!Native.BelongsToWindow(element,snap.Hwnd,Convert.ToInt32(w["pid"])))throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","element-validation","check","element-identity-or-bounds"));if((bool)current["password"])throw new Failure("PASSWORD_FIELD");var rect=Native.Obj(current["rect"]);
     int left=Math.Max(Convert.ToInt32(rect["left"]),snap.Frame.Capture.Left),top=Math.Max(Convert.ToInt32(rect["top"]),snap.Frame.Capture.Top),right=Math.Min(Convert.ToInt32(rect["left"])+Convert.ToInt32(rect["width"]),snap.Frame.Capture.Right),bottom=Math.Min(Convert.ToInt32(rect["top"])+Convert.ToInt32(rect["height"]),snap.Frame.Capture.Bottom);
     if(right<=left||bottom<=top)throw new Failure("INVALID_COORDINATE");point=new Native.POINT{X=left+(right-left)/2,Y=top+(bottom-top)/2};clicked=element;targetBounds=new Native.RECT{Left=left,Top=top,Right=right,Bottom=bottom};
    }else{var size=Native.Obj(snap.Data["imageSize"]);var capture=Native.Obj(snap.Data["captureRect"]);point=Native.Map(Native.I(request,"x",0,1599),Native.I(request,"y",0,1199),new Native.RECT{Left=Convert.ToInt32(capture["left"]),Top=Convert.ToInt32(capture["top"]),Right=Convert.ToInt32(capture["left"])+Convert.ToInt32(capture["width"]),Bottom=Convert.ToInt32(capture["top"])+Convert.ToInt32(capture["height"])},Convert.ToInt32(size["width"]),Convert.ToInt32(size["height"]));}
    int radius=(int)Math.Ceiling(12*snap.Dpi/96.0);
    // Canvas fallback = coordinate click whose point is inside an observed element whose role is
    // ControlType.Image (or ends with ".Image"). No other heuristic may weaken non-canvas clicks.
    bool canvas=clicked==null&&Native.PointInImageElement((Dictionary<string,object>[])snap.Data["elements"],point.X,point.Y);
    var region=canvas||clicked!=null?Native.ClampRegion(new Native.RECT{Left=point.X-radius,Top=point.Y-radius,Right=point.X+radius+1,Bottom=point.Y+radius+1},snap.Frame.Capture):snap.Frame.Capture;
    if(canvas)VisualCanvas(snap,w,region);else Visual(snap,w,region);
    CheckHit(snap,w,point,clicked);
   }else{
    if(request.ContainsKey("element")||request.ContainsKey("elementName")||request.ContainsKey("elementRole")||request.ContainsKey("elementExact")||request.ContainsKey("x")||request.ContainsKey("y"))throw new Failure("INVALID_ARGUMENT");
    if(focused==null)throw new Failure("FOCUS_MISMATCH","not_sent",Native.D("stage","focus-validation","check","no-observed-focus"));FreshContent(snap,w);
    if(action=="type"){if(request.ContainsKey("key"))throw new Failure("UNSUPPORTED_INPUT");text=Native.ValidateText(Native.S(request,"text"));string rejection=Native.TypeRejection(focused,text);if(rejection!=null)throw new Failure(rejection);}
    else if(action=="key"){if(request.ContainsKey("text"))throw new Failure("INVALID_ARGUMENT");key=Native.S(request,"key");Native.Keys(key);}else throw new Failure("INVALID_ARGUMENT");
    Native.GetCursorPos(out point);
   }
   if(tool=="mk_keyboard")Layouts.Validate(LayoutPlatform(w,r,actionGeneration),delegate(){Check(r);UserQuiet(actionGeneration);});
   string profile=HumanProfile(request);var planner=new Humanizer();Native.POINT origin;if(!Native.GetCursorPos(out origin))throw new Failure("INPUT_UNKNOWN");uint focusPid;
   IntPtr layout=Native.GetKeyboardLayout(Native.GetWindowThreadProcessId(snap.NativeFocus==IntPtr.Zero?snap.Hwnd:snap.NativeFocus,out focusPid));
   bool typoEligible=text!=null&&Object.Equals(request.ContainsKey("allowTypos")?request["allowTypos"]:false,true)&&profile!="off"&&inputMode!="unicode"&&((long)layout&0xffff)==0x409&&Humanizer.TypoEligible(Native.S(w,"app"),Native.S(w,"title"),focused,text);
   double typoRate=typoEligible?(settings.ContainsKey("typoRate")?Convert.ToDouble(settings["typoRate"]):1.5):0;
   typoEligible=typoEligible&&typoRate>0;
   KeyboardPlan keyboard=text!=null?planner.Text(text,inputMode,profile,paceMs,layout,typoRate):key!=null?planner.Key(key,profile):null;MotionPlan motion=null;
   if(tool=="mk_mouse"){int left=Native.GetSystemMetrics(76),top=Native.GetSystemMetrics(77);motion=planner.MovePath(origin,point,new Native.RECT{Left=left,Top=top,Right=left+Native.GetSystemMetrics(78),Bottom=top+Native.GetSystemMetrics(79)},targetBounds,profile,clicked!=null);point=motion.Target;CheckHit(snap,w,point,clicked);}
   int plannedDelay=motion!=null?motion.DelayMs:keyboard.DelayMs;Humanizer.Budget(plannedDelay);
   int points=0,moves=0,typos=0;KeyUnit activeUnit=null;long firstMoveAt=-1,lastMoveAt=-1;sentEvents=0;string execution="not_sent";Failure error=null;string deliveredAt=null;int settledMs=0;bool deliveryConfirmed=true;long inputDeadline=Now()+30000;var inputWatch=Stopwatch.StartNew();int inputDuration=0;Native.TimerResolution timing=null;
   Action guard=delegate(){Check(r);UserQuiet(actionGeneration);if(Now()>inputDeadline)throw new Failure("HUMANIZE_BUDGET_EXCEEDED","not_sent",Native.D("stage","humanization","check","runtime-budget","requiredAction","split-text-or-select-off"));};
   long highBefore=Interlocked.Read(ref Native.InputTimer.HighResolutionWaits),fallbackBefore=Interlocked.Read(ref Native.InputTimer.FallbackWaits),timeoutsBefore=Interlocked.Read(ref Native.InputTimer.Timeouts);
   Action<int> pause=ms=>Pause(ms,guard);uint lastTick=0;bool tickCaptured=false;
   Action<Native.INPUT[]> sendKeyboard=delegate(Native.INPUT[] events){
    guard();if(events.Any(e=>e.type==1&&(e.U.ki.dwFlags&2)==0)){Native.ValidateWindow(w,parent,true);Layouts.Validate(LayoutPlatform(w,r,actionGeneration),guard);if(points==0)FreshContent(snap,w);else RequireFocus(snap,w,false,false);if(activeUnit!=null&&activeUnit.Correction&&!Humanizer.CorrectionMatches(focused,RequireFocus(snap,w,true,false),text,activeUnit))throw new Failure("STATE_CHANGED");uint ignored;if(Native.GetKeyboardLayout(Native.GetWindowThreadProcessId(snap.NativeFocus,out ignored))!=layout)throw new Failure("STATE_CHANGED");}
    lastTick=Native.InputTick();tickCaptured=true;Send(events,r);
   };
   try{
    if(profile!="off")timing=new Native.TimerResolution();
    guard();Overlay.Show(snap.Hwnd,tool=="mk_mouse"?origin:point,tool=="mk_mouse"?"DSH 点击中":"DSH 输入中");Native.ValidateWindow(w,parent,true);
    if(tool=="mk_mouse"){
     long lastWindowCheck=Now(),lastPointerPaint=0;
     Action moveGuard=delegate(){guard();Native.Desktop();if(!Native.IsWindow(snap.Hwnd)||!Native.IsWindowVisible(snap.Hwnd))throw new Failure("TARGET_GONE");if(Native.GetForegroundWindow()!=snap.Hwnd)throw new Failure("FOCUS_MISMATCH");if(Now()-lastWindowCheck>=100){Native.ValidateWindow(w,parent,true);lastWindowCheck=Now();}};
     Humanizer.RunMotion(motion,p=>{if(Native.MonitorFromPoint(p,0)==IntPtr.Zero)return;Send(new[]{Native.Move(p)},r);lastMoveAt=Now();if(firstMoveAt<0)firstMoveAt=lastMoveAt;moves++;if(Now()-lastPointerPaint>=32||p.X==point.X&&p.Y==point.Y){Overlay.MovePointer(p);lastPointerPaint=Now();}},pause,moveGuard,Now);
     guard();Native.ValidateWindow(w,parent,true);Native.POINT actual;Native.GetCursorPos(out actual);
     if(Math.Abs(actual.X-point.X)>2||Math.Abs(actual.Y-point.Y)>2){Send(new[]{Native.Move(point)},r);lastMoveAt=Now();if(firstMoveAt<0)firstMoveAt=lastMoveAt;moves++;Native.GetCursorPos(out actual);}
     if(Math.Abs(actual.X-point.X)>2||Math.Abs(actual.Y-point.Y)>2)throw new Failure("INPUT_INTERFERENCE","not_sent",Native.D("stage","input-arbitration","check","pointer-moved","requiredAction","reobserve"));
     Fresh(snap,w,r);
     if(clicked!=null){int budget=0;var live=Native.Element(clicked,"recheck",ref budget);var before=((Dictionary<string,object>[])snap.Data["elements"]).FirstOrDefault(e=>Object.Equals(e["runtimeId"],live["runtimeId"]));if(before==null||!Native.SameElementState(before,live)||!Native.BelongsToWindow(clicked,snap.Hwnd,Convert.ToInt32(w["pid"])))throw new Failure("STATE_CHANGED");}
     CheckHit(snap,w,point,clicked);lastTick=Native.InputTick();tickCaptured=true;Send(new[]{Native.Mouse(2)},r);pause(motion.HoldMs);Send(new[]{Native.Mouse(4)},r);Overlay.ClickFeedback();
    }else if(profile=="off"&&(paceMs??0)==0&&text!=null){
     for(int start=0;start<keyboard.Units.Count;){guard();Native.ValidateWindow(w,parent,true);RequireFocus(snap,w,false,start==0);var input=new List<Native.INPUT>();int count=Math.Min(32,keyboard.Units.Count-start);for(int i=0;i<count;i++)foreach(var step in keyboard.Units[start+i].Steps)input.AddRange(step.Inputs);sendKeyboard(input.ToArray());points+=count;start+=count;}
    }else{foreach(var unit in keyboard.Units){activeUnit=unit;Humanizer.Run(unit,sendKeyboard,pause,guard);if(text!=null){points+=unit.CodePoints;if(unit.IsTypo)typos++;}}}
    if(tickCaptured)deliveryConfirmed=Native.WaitInputDelivered(lastTick,300,guard);deliveredAt=DateTime.UtcNow.ToString("o");inputDuration=(int)inputWatch.ElapsedMilliseconds;if(timing!=null)timing.Dispose();Settle(settleMs,guard,out settledMs);execution="sent";
   }catch(Failure e){error=e;execution=sentEvents>0?"partially_sent":e.Execution;}catch{error=new Failure("INPUT_UNKNOWN","unknown");execution="unknown";}finally{if(inputDuration==0)inputDuration=(int)inputWatch.ElapsedMilliseconds;try{ReleaseOwned();}catch{execution="unknown";error=new Failure("CONTROL_CLOSE_FAILED","unknown");}finally{if(timing!=null)timing.Dispose();}}
   // FR-05: a failure after the first successful SendInput can never be reported as not_sent;
   // the sentEvents counter above is the single source of that rule.
   if(timing!=null&&!timing.Released){execution="unknown";error=new Failure("CONTROL_CLOSE_FAILED","unknown");}
   var receipt=Native.D("execution",execution,"verification","unverified","sentCodePoints",points,"observation",null,"settledMs",settledMs,"humanization",Native.D("profile",profile,"inputDurationMs",inputDuration,"plannedDelayMs",plannedDelay,"mouseMoveEvents",moves,"mouseMoveDurationMs",Math.Max(0,lastMoveAt-firstMoveAt),"typos",typos,"typoEligible",typoEligible,"inputLayout",Layouts.Snapshot(),"timerResolutionMs",timing!=null&&timing.Acquired?1:0,"timerResolutionReleased",timing==null||timing.Released,"timerWaits",Native.D("highResolution",Interlocked.Read(ref Native.InputTimer.HighResolutionWaits)-highBefore,"fallback",Interlocked.Read(ref Native.InputTimer.FallbackWaits)-fallbackBefore,"timeouts",Interlocked.Read(ref Native.InputTimer.Timeouts)-timeoutsBefore)));
   if(execution!="not_sent")receipt["deliveredAt"]=deliveredAt??DateTime.UtcNow.ToString("o");
   if(tool=="mk_keyboard"&&focused!=null)receipt["diagnostics"]=Native.D("inputTarget",Object.Equals(focused["editable"],true)?"editable":"non-editable");
   if(error!=null){if(error.Code=="CONTROL_CLOSE_FAILED"||error.Code=="INPUT_UNKNOWN"){gate=false;stopReason=error.Code;}var failure=Native.D("code",error.Code,"message",error.Details!=null&&Object.Equals(error.Details.ContainsKey("stage")?error.Details["stage"]:null,"input-layout")?"请手动 Win+Space 切到 ENG（美式英文）后重试；不要重放已发送内容。":"Input was interrupted; inspect the target before recovery.");if(error.Details!=null)failure["details"]=error.Details;receipt["error"]=failure;}
   else{
    Failure observeFailure=null;Dictionary<string,object> post=null;bool stable=false;
    try{
     Check(r);Overlay.Stage("DSH 正在确认");long deadline=Now()+1500;Native.VisualFrame previous=null;Dictionary<string,object> previousFocus=null;
     while(Now()<deadline){Check(r);Native.ValidateWindow(w,parent,true);Native.RECT captured;Native.VisualFrame frame;Dictionary<string,object> currentFocus=null;try{var e=AutomationElement.FocusedElement;if(Native.BelongsToWindow(e,snap.Hwnd,Convert.ToInt32(w["pid"]))){int budget=16000;currentFocus=Native.Element(e,"post-focus",ref budget);}}catch{}
      Overlay.Suspend();try{using(var b=Native.Capture(snap.Hwnd,out captured))frame=Native.Frame(b,captured,Native.NativeCaret(snap.Hwnd,captured,snap.Dpi));}finally{Overlay.Resume();}if(previous!=null&&Native.CompareFrame(previous,frame,previousFocus,currentFocus,snap.Dpi,frame.Capture).Passed){stable=true;break;}previous=frame;previousFocus=currentFocus;int wait=(int)Math.Min(80,Math.Max(0,deadline-Now()));if(wait>0)Thread.Sleep(wait);}
     try{post=Observe(w,r,false,includeImage,savePath,null,saveRegion);}
     catch(Failure){Thread.Sleep(150);Check(r);try{post=Observe(w,r,false,includeImage,savePath,null,saveRegion);}catch(Failure second){observeFailure=second;}}
    }catch(Failure failure){observeFailure=observeFailure??failure;}catch{observeFailure=observeFailure??new Failure("POST_OBSERVE_FAILED");}
    if(post!=null){
     if(!stable){Native.Obj(post["coverage"])["unstable"]=true;post["warnings"]=new[]{"Visual stability was not established within 1500 ms; this is not a business-completion signal."};}
     receipt["observation"]=post;
     if(text!=null&&focused!=null&&focused.ContainsKey("value")&&focused.ContainsKey("selectionStart")&&focused.ContainsKey("selectionEnd")&&!focused.ContainsKey("valueTruncated")){
      var current=post.ContainsKey("focusedElement")?Native.Obj(post["focusedElement"]):null;var before=(string)focused["value"];int a=Convert.ToInt32(focused["selectionStart"]),b=Convert.ToInt32(focused["selectionEnd"]);
      if(a>=0&&b>=a&&b<=before.Length&&current!=null&&current.ContainsKey("value")&&!current.ContainsKey("valueTruncated")&&Object.Equals(current["runtimeId"],focused["runtimeId"])){
       string expected=(before.Substring(0,a)+text+before.Substring(b)).Replace("\r\n","\n").Replace('\r','\n');string actual=((string)current["value"]).Replace("\r\n","\n").Replace('\r','\n');receipt["verification"]=expected==actual?"verified":"mismatch";receipt["reason"]="Complete focused-editor value compared with the observed selection replacement.";
      }
     }
    }else{receipt["observationError"]=Native.D("code",observeFailure.Code,"message","Input was sent; post-action observation unavailable ("+observeFailure.Code+"). Do not replay input.");}
   }
   Recovery(receipt);if(!deliveryConfirmed&&Object.Equals(receipt["requiredAction"],"none"))receipt["requiredAction"]="reobserve";return receipt;
  }
  static void CheckHit(Snapshot snap,Dictionary<string,object>w,Native.POINT point,AutomationElement expected){
   Overlay.Suspend();try{
    var hit=Native.WindowFromPoint(point);if(Native.GetAncestor(hit,2)!=snap.Hwnd)throw new Failure("OCCLUDED_TARGET","not_sent",Native.D("stage","element-validation","check","occluded-hit"));
    var under=AutomationElement.FromPoint(new System.Windows.Point(point.X,point.Y));if(under.Current.IsPassword)throw new Failure("PASSWORD_FIELD");
    if(expected!=null&&(!Native.BelongsToWindow(under,snap.Hwnd,Convert.ToInt32(w["pid"]))||!Native.IsElementOrDescendant(expected,under)))throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","element-validation","check","hit-identity"));
   }catch(Failure){throw;}catch{throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","element-validation","check","hit-unavailable"));}finally{Overlay.Resume();}
  }
 }
}
