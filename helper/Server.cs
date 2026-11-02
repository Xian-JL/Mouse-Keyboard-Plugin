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
  public const string Version="0.3.1";
  static readonly InputArbiter Human=new InputArbiter();static long actionGeneration;
  static readonly object Sync=new object(),Output=new object(),CloseSync=new object();
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024,RecursionLimit=40};
  static string nonce,run,path,stopReason;static int parent;static long epoch;static volatile bool workerBusy,closing;
  static volatile bool gate;static Dictionary<string,object> settings;static Snapshot last;
  static readonly ManualResetEventSlim WorkerDone=new ManualResetEventSlim(true);
  static readonly HashSet<string> Down=new HashSet<string>();static int sentEvents;
  static readonly BlockingCollection<Action> LeaseQueue=new BlockingCollection<Action>();static Mutex mutex;static bool lease;
  static long lastActivity;static bool shuttingDown;
  sealed class Snapshot {public Dictionary<string,object> Data;public IntPtr Hwnd,NativeFocus;public Native.RECT Rect;public uint Dpi;public long At,HumanGeneration;public Dictionary<string,AutomationElement> Elements;public AutomationElement Focus;public Native.VisualFrame Frame;}
  public static bool InputAllowed {get{return gate&&!shuttingDown;}}
  static long Now(){return Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency;}
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
   Native.Exact(s,"enabled","snapshotTtlMs","controlIdleMs","screenshotMaxWidth","screenshotMaxHeight","maxElements","maxTreeDepth","diagnosticsEnabled");
   if(!s.ContainsKey("enabled")||!(s["enabled"] is bool)||!(bool)s["enabled"])throw new Failure("CONFIG_UNAVAILABLE");
   Native.I(s,"snapshotTtlMs",1000,60000);Native.I(s,"controlIdleMs",60000,900000);Native.I(s,"screenshotMaxWidth",640,1600);Native.I(s,"screenshotMaxHeight",480,1200);Native.I(s,"maxElements",50,300);Native.I(s,"maxTreeDepth",3,10);settings=s;
  }
  public static void Run(int parentPid,string asset){
   parent=parentPid;path=asset;
   var leaseThread=new Thread(delegate(){var sid=WindowsIdentity.GetCurrent().User.Value;mutex=new Mutex(false,"Local\\MouseKeyboardPlugin-"+sid);foreach(var action in LeaseQueue.GetConsumingEnumerable())action();});leaseThread.IsBackground=true;leaseThread.Start();
   Process host;try{host=Process.GetProcessById(parent);}catch{return;}
   using(var watcher=new Timer(delegate(object unused){try{if(host.HasExited){shuttingDown=true;gate=false;try{CloseRun(run);}catch{}Environment.Exit(0);}else{ExpireIdle();if(gate&&Overlay.Visible&&Now()-Interlocked.Read(ref lastActivity)>10000)Overlay.HideIdle();}}catch{}},null,1000,1000)) {
    for(;;){string line=ReadLineBounded();if(line==null)break;Dictionary<string,object> req;
     try{req=Native.Obj(Json.DeserializeObject(line));Native.Exact(req,"protocol","nonce","id","run","method","params");if(Native.I(req,"protocol",1,1)!=1)throw new Failure("PROTOCOL_ERROR");var nextNonce=Native.S(req,"nonce");if(nonce==null)nonce=nextNonce;if(nonce!=nextNonce||nextNonce.Length>80||Native.S(req,"id").Length>80||Native.S(req,"run").Length>80)throw new Failure("PROTOCOL_ERROR");Native.Obj(req["params"]);}catch{gate=false;break;}
     var method=Native.S(req,"method");
     if(method=="end") {var captured=req;try{lock(Sync){if(run!=null&&run!=Native.S(req,"run"))throw new Failure("NOT_AUTHORIZED");gate=false;closing=true;epoch++;last=null;}}catch(Failure e){Write(Error(req,e));continue;}Task.Run(delegate(){try{Write(Result(captured,CloseRun(Native.S(captured,"run"))));}catch(Failure e){Write(Error(captured,e));}catch{Write(Error(captured,new Failure("CONTROL_CLOSE_FAILED","unknown")));}});continue;}
     if(method=="status"){Write(Result(req,Native.D("inputReady",gate,"overlayVisible",Overlay.Visible,"pendingInputs",workerBusy?1:0)));continue;}
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
    try{Overlay.Start(path);Human.Reset();Overlay.EnableHooks();lock(Sync){if(closing)throw new Failure("CONTROL_CLOSING");run=r;stopReason=null;last=null;gate=true;epoch++;lastActivity=Now();}return Native.D("protocol",1,"version",Version,"inputReady",true,"dpi",true,"uia",true,"overlay",true);}catch{Overlay.Close();Release();throw;}
   }
   Check(r);
   if(method=="targets"){Native.Exact(p,"query","aliases");string q=p.ContainsKey("query")?Native.S(p,"query"):null;if(q!=null&&(q.Length==0||q.Length>256))throw new Failure("INVALID_ARGUMENT");string[] aliases=null;if(p.ContainsKey("aliases")){var a=p["aliases"] as object[];if(a==null||a.Length>8||a.Any(v=>!(v is string)||((string)v).Length<1||((string)v).Length>128))throw new Failure("INVALID_ARGUMENT");aliases=a.Cast<string>().ToArray();}return Native.Targets(q,parent,aliases);}
   bool includeImage=true;if(p.ContainsKey("includeImage")){if(!(p["includeImage"] is bool))throw new Failure("INVALID_ARGUMENT");includeImage=(bool)p["includeImage"];}
   if(method=="observe"){Native.Exact(p,"window","includeImage","detail");string detail=p.ContainsKey("detail")?Native.S(p,"detail"):"compact";if(detail!="compact"&&detail!="expanded")throw new Failure("INVALID_ARGUMENT");return Native.CompactObservation(Observe(Native.Obj(p["window"]),r,true,includeImage),detail=="expanded");}
   if(method=="act"){Native.Exact(p,"window","observation","request","includeImage");var result=Act(Native.Obj(p["window"]),Native.Obj(p["observation"]),Native.Obj(p["request"]),r,includeImage);if(result.ContainsKey("observation"))result["observation"]=Native.CompactObservation(Native.Obj(result["observation"]));return result;}
   throw new Failure("PROTOCOL_ERROR");
  }
  static Dictionary<string,object> CloseRun(string requested){
   lock(CloseSync){
   lock(Sync){if(run!=null&&run!=requested)throw new Failure("NOT_AUTHORIZED");gate=false;epoch++;last=null;closing=true;}
   try{
    if(!WorkerDone.Wait(1800))throw new Failure("CONTROL_CLOSE_FAILED","unknown");
    try{ReleaseOwned();}finally{Overlay.Close();}Release();
    lock(Sync){run=null;}return Native.D("inputReleased",true,"overlayVisible",false,"pendingInputs",0);
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
  static Dictionary<string,object> Observe(Dictionary<string,object>w,string r,bool activate,bool includeImage=true){
   for(int attempt=0;attempt<2;attempt++){
    Check(r);Overlay.Stage("DSH 正在确认");var h=Native.ValidateWindow(w,parent,false,activate);
    if(activate){
     long generation=Human.Generation;
     Action guard=delegate(){Check(r);UserQuiet(generation);Native.NoHeldInputs();Native.ValidateWindow(w,parent,false,true);};
     try{Foreground.Bring(new WindowsForegroundPlatform(),h,guard);}catch(Failure failure){if(failure.Code=="CONTROL_CLOSE_FAILED")UserStop("HELPER_FAILED");throw;}
    }else Native.ValidateWindow(w,parent,true);
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
    Native.RECT capture;Dictionary<string,object> encoded;Native.VisualFrame frame;
    Overlay.Suspend();try{using(var bitmap=Native.Capture(h,out capture)){frame=Native.Frame(bitmap,capture,Native.NativeCaret(h,capture,dpi));captureMs=watch.ElapsedMilliseconds-uiaMs;long encodingAt=watch.ElapsedMilliseconds;encoded=includeImage?Native.Encoded(bitmap,Setting("screenshotMaxWidth"),Setting("screenshotMaxHeight")):Native.D("imageSize",Native.ImageSize(bitmap,Setting("screenshotMaxWidth"),Setting("screenshotMaxHeight")),"png","");encodeMs=watch.ElapsedMilliseconds-encodingAt;}}finally{Overlay.Resume();}
    Check(r);Native.ValidateWindow(w,parent,true);if(Human.Generation!=humanGeneration)throw new Failure("USER_BUSY","not_sent",Native.D("stage","observation","check","human-activity-changed","requiredAction","reobserve"));watch.Stop();Native.ObservationBudget(watch.ElapsedMilliseconds,"capture",Native.ObservationBudgetMs);if(!Native.SameRect(rect,Native.GetRect(h))||Native.GetDpiForWindow(h)!=dpi){if(attempt==0)continue;throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","observation","check","capture-inconsistent","dpi",dpi));}
    bool textTruncated=entries.Any(e=>e.ContainsKey("valueTruncated")||e.ContainsKey("valueUnavailable"));
    var data=Native.D("window",Native.Window(h,parent),"captureRect",Native.Rect(capture),"imageSize",encoded["imageSize"],"png",encoded["png"],"elements",entries.ToArray(),"fingerprint",frame.Hash,"capturedAt",DateTime.UtcNow.ToString("o"),"durationMs",watch.ElapsedMilliseconds,"coverage",Native.D("truncated",truncated,"textTruncated",textTruncated),"warnings",new string[0]);
    if(focused!=null)data["focusedElement"]=focused;
    data["timings"]=Native.D("uiaMs",uiaMs,"captureMs",captureMs,"encodeMs",encodeMs,"totalMs",watch.ElapsedMilliseconds);data["imageEncoded"]=includeImage;
    lock(Sync){Check(r);last=new Snapshot{Data=data,Hwnd=h,Rect=rect,Dpi=dpi,At=Now(),HumanGeneration=humanGeneration,Elements=refs,Focus=focus,NativeFocus=nativeFocus,Frame=frame};}Overlay.Stage("DSH 等待下一步");return data;
   }throw new Failure("STATE_CHANGED");
  }
  static void Fresh(Snapshot snap,Dictionary<string,object>w,string r){
   Check(r);UserQuiet(snap.HumanGeneration);Native.ValidateWindow(w,parent,true);if(Now()-snap.At>Setting("snapshotTtlMs")||!Native.SameRect(snap.Rect,Native.GetRect(snap.Hwnd))||Native.GetDpiForWindow(snap.Hwnd)!=snap.Dpi)throw new Failure("STALE_SNAPSHOT","not_sent",Native.D("stage","snapshot","check","age-or-geometry","dpi",snap.Dpi,"snapshotAgeMs",Now()-snap.At));
  }
  static Dictionary<string,object> FreshContent(Snapshot snap,Dictionary<string,object>w){
   var before=Native.Obj(snap.Data["focusedElement"]);var after=RequireFocus(snap,w,true);
   if(before.ContainsKey("value")&&!before.ContainsKey("valueTruncated"))foreach(string key in new[]{"value","valueTruncated","selectionStart","selectionEnd"}){object a,b;if(before.TryGetValue(key,out a)!=after.TryGetValue(key,out b)||!Object.Equals(a,b))throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","focus-validation","check","editor-content-or-selection"));}return after;
  }
  static void Visual(Snapshot snap,Dictionary<string,object>w,Native.RECT region){
   Dictionary<string,object> before=snap.Data.ContainsKey("focusedElement")?Native.Obj(snap.Data["focusedElement"]):null,after=null;
   if(before!=null){try{after=FreshContent(snap,w);}catch(Failure e){if(e.Code=="STATE_CHANGED")throw;}}
   Native.RECT capture;Native.VisualFrame frame;Overlay.Suspend();try{using(var b=Native.Capture(snap.Hwnd,out capture))frame=Native.Frame(b,capture,Native.NativeCaret(snap.Hwnd,capture,snap.Dpi));}finally{Overlay.Resume();}
   var comparison=Native.CompareFrame(snap.Frame,frame,before,after,snap.Dpi,region);comparison.Details["snapshotAgeMs"]=Now()-snap.At;if(!comparison.Passed)throw new Failure("STATE_CHANGED","not_sent",comparison.Details);
  }
  static Dictionary<string,object> RequireFocus(Snapshot snap,Dictionary<string,object>w,bool readText=false){
   try{
    if(snap.Focus==null||!snap.Data.ContainsKey("focusedElement"))throw new Failure("FOCUS_MISMATCH");
    var before=Native.Obj(snap.Data["focusedElement"]);var live=AutomationElement.FocusedElement;var c=live.Current;
    bool same=Native.RuntimeId(live)==Native.S(before,"runtimeId"),native=Native.ForegroundFocus(snap.Hwnd)==snap.NativeFocus;
    int budget=readText?16000:0;var current=Native.Element(live,Native.S(before,"ref"),ref budget);
    if(c.IsPassword||(bool)before["password"])throw new Failure("PASSWORD_FIELD");
    if(!Native.FocusEvidence(same,native,Native.BelongsToWindow(live,snap.Hwnd,Convert.ToInt32(w["pid"])),c.IsEnabled&&!c.IsOffscreen,c.HasKeyboardFocus,(bool)current["editable"],c.IsKeyboardFocusable))throw new Failure("FOCUS_MISMATCH");
    if(!Native.SameElementState(before,current))throw new Failure("STATE_CHANGED");return current;
   }catch(Failure e){throw new Failure(e.Code,e.Execution,e.Details??Native.D("stage","focus-validation","check",e.Code.ToLowerInvariant().Replace('_','-')));}catch{throw new Failure("FOCUS_MISMATCH","not_sent",Native.D("stage","focus-validation","check","focus-unavailable"));}
  }
  static void Send(Native.INPUT[] inputs,string r){
   lock(Sync){Check(r);UserQuiet(actionGeneration);Native.NoHeldInputs();Check(r);uint count=Native.SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(Native.INPUT)));sentEvents+=(int)count;
    for(int i=0;i<count;i++){var e=inputs[i];if(e.type==1){string code=((e.U.ki.dwFlags&4)!=0?"u:":"v:")+(((e.U.ki.dwFlags&4)!=0)?e.U.ki.wScan:e.U.ki.wVk);if((e.U.ki.dwFlags&2)!=0)Down.Remove(code);else Down.Add(code);}else if(e.type==0){if((e.U.mi.dwFlags&2)!=0)Down.Add("mouse");if((e.U.mi.dwFlags&4)!=0)Down.Remove("mouse");}}
    if(count!=inputs.Length)throw new Failure("INPUT_PARTIAL",count==0?"not_sent":"partially_sent");
   }
  }
  static void ReleaseOwned(){lock(Sync){bool failed=false;foreach(var item in Down.ToArray()){Native.INPUT up;if(item=="mouse")up=Native.Mouse(4);else{var a=item.Split(':');ushort k=UInt16.Parse(a[1]);up=a[0]=="u"?Native.Unicode((char)k,true):Native.Key(k,true);}if(Native.SendInput(1,new[]{up},Marshal.SizeOf(typeof(Native.INPUT)))==1)Down.Remove(item);else failed=true;}if(failed)throw new Failure("CONTROL_CLOSE_FAILED","unknown");}}
  static Dictionary<string,object> Act(Dictionary<string,object>w,Dictionary<string,object>observation,Dictionary<string,object>request,string r,bool includeImage=true){
   Snapshot snap;lock(Sync){Check(r);snap=last;last=null;}if(snap==null||!Object.Equals(snap.Data["fingerprint"],observation["fingerprint"]))throw new Failure("STALE_SNAPSHOT");
   Native.Exact(observation,"fingerprint");
   string tool=Native.S(request,"tool"),action=Native.S(request,"action");if(tool!="mk_mouse"&&tool!="mk_keyboard")throw new Failure("INVALID_ARGUMENT");
   Native.Exact(request,"tool","action","target","snapshot","element","x","y","text","key");
   string text=null,key=null;Native.POINT point=new Native.POINT();Dictionary<string,object>focused=snap.Data.ContainsKey("focusedElement")?Native.Obj(snap.Data["focusedElement"]):null;
   Fresh(snap,w,r);Native.NoHeldModifiers();actionGeneration=snap.HumanGeneration;AutomationElement clicked=null;
   if(tool=="mk_mouse"){
    if(action!="click"||request.ContainsKey("text")||request.ContainsKey("key"))throw new Failure("INVALID_ARGUMENT");
    if(request.ContainsKey("element")){
     if(request.ContainsKey("x")||request.ContainsKey("y"))throw new Failure("INVALID_ARGUMENT");string reference=Native.S(request,"element");AutomationElement element;if(!snap.Elements.TryGetValue(reference,out element))throw new Failure("STATE_CHANGED");int budget=0;var current=Native.Element(element,reference,ref budget);var old=((Dictionary<string,object>[])snap.Data["elements"]).FirstOrDefault(e=>(string)e["ref"]==reference);
     if(old==null||!Native.SameElementState(old,current)||!(bool)current["enabled"]||!Native.BelongsToWindow(element,snap.Hwnd,Convert.ToInt32(w["pid"])))throw new Failure("STATE_CHANGED","not_sent",Native.D("stage","element-validation","check","element-identity-or-bounds"));if((bool)current["password"])throw new Failure("PASSWORD_FIELD");var rect=Native.Obj(current["rect"]);
     int left=Math.Max(Convert.ToInt32(rect["left"]),snap.Frame.Capture.Left),top=Math.Max(Convert.ToInt32(rect["top"]),snap.Frame.Capture.Top),right=Math.Min(Convert.ToInt32(rect["left"])+Convert.ToInt32(rect["width"]),snap.Frame.Capture.Right),bottom=Math.Min(Convert.ToInt32(rect["top"])+Convert.ToInt32(rect["height"]),snap.Frame.Capture.Bottom);
     if(right<=left||bottom<=top)throw new Failure("INVALID_COORDINATE");point=new Native.POINT{X=left+(right-left)/2,Y=top+(bottom-top)/2};clicked=element;
    }else{var size=Native.Obj(snap.Data["imageSize"]);var capture=Native.Obj(snap.Data["captureRect"]);point=Native.Map(Native.I(request,"x",0,1599),Native.I(request,"y",0,1199),new Native.RECT{Left=Convert.ToInt32(capture["left"]),Top=Convert.ToInt32(capture["top"]),Right=Convert.ToInt32(capture["left"])+Convert.ToInt32(capture["width"]),Bottom=Convert.ToInt32(capture["top"])+Convert.ToInt32(capture["height"])},Convert.ToInt32(size["width"]),Convert.ToInt32(size["height"]));}
    int radius=(int)Math.Ceiling(12*snap.Dpi/96.0);var region=clicked==null?snap.Frame.Capture:new Native.RECT{Left=point.X-radius,Top=point.Y-radius,Right=point.X+radius+1,Bottom=point.Y+radius+1};Visual(snap,w,region);
    CheckHit(snap,w,point,clicked);
   }else{
    if(request.ContainsKey("element")||request.ContainsKey("x")||request.ContainsKey("y"))throw new Failure("INVALID_ARGUMENT");
    if(focused==null)throw new Failure("FOCUS_MISMATCH","not_sent",Native.D("stage","focus-validation","check","no-observed-focus"));FreshContent(snap,w);
    if(action=="type"){if(request.ContainsKey("key")||!(bool)focused["editable"])throw new Failure("UNSUPPORTED_INPUT");text=Native.ValidateText(Native.S(request,"text"));if(text.Contains("\n")&&!Object.Equals(focused["multiline"],"true"))throw new Failure("MULTILINE_UNCONFIRMED");}
    else if(action=="key"){if(request.ContainsKey("text"))throw new Failure("INVALID_ARGUMENT");key=Native.S(request,"key");Native.Keys(key);}else throw new Failure("INVALID_ARGUMENT");
    Native.GetCursorPos(out point);
   }
   int points=0;sentEvents=0;string execution="not_sent";Failure error=null;
   try{
    UserQuiet(snap.HumanGeneration);Overlay.Show(snap.Hwnd,point,tool=="mk_mouse"?"DSH 点击中":"DSH 输入中");Check(r);Native.ValidateWindow(w,parent,true);
    if(tool=="mk_mouse") {Send(new[]{Native.Move(point)},r);Check(r);Native.ValidateWindow(w,parent,true);Native.POINT actual;Native.GetCursorPos(out actual);if(Math.Abs(actual.X-point.X)>2||Math.Abs(actual.Y-point.Y)>2)throw new Failure("INPUT_INTERFERENCE","not_sent",Native.D("stage","input-arbitration","check","pointer-moved","requiredAction","reobserve"));CheckHit(snap,w,point,clicked);Send(new[]{Native.Move(point),Native.Mouse(2),Native.Mouse(4)},r);Overlay.ClickFeedback();}
    else if(action=="key"){RequireFocus(snap,w);Native.NoHeldModifiers();var keys=Native.Keys(key);var input=new List<Native.INPUT>();foreach(var k in keys)input.Add(Native.Key(k,false));foreach(var k in keys.Reverse())input.Add(Native.Key(k,true));Send(input.ToArray(),r);}
    else{
     for(int start=0;start<text.Length;){Check(r);Native.ValidateWindow(w,parent,true);RequireFocus(snap,w);Native.NoHeldModifiers();var input=new List<Native.INPUT>();int chunk=0;
      while(start<text.Length&&chunk<32){char c=text[start++];if(c=='\n'){input.Add(Native.Key(13,false));input.Add(Native.Key(13,true));}else{input.Add(Native.Unicode(c,false));input.Add(Native.Unicode(c,true));if(Char.IsHighSurrogate(c)){char low=text[start++];input.Add(Native.Unicode(low,false));input.Add(Native.Unicode(low,true));}}chunk++;}
      Send(input.ToArray(),r);points+=chunk;
     }
    }
    execution="sent";
   }catch(Failure e){error=e;execution=sentEvents>0?"partially_sent":e.Execution;}catch{error=new Failure("INPUT_UNKNOWN","unknown");execution="unknown";}finally{try{ReleaseOwned();}catch{execution="unknown";error=new Failure("CONTROL_CLOSE_FAILED","unknown");}}
   var receipt=Native.D("execution",execution,"verification","unverified","sentCodePoints",points);
   if(error!=null){if(error.Code=="CONTROL_CLOSE_FAILED"||error.Code=="INPUT_UNKNOWN"){gate=false;stopReason=error.Code;}var failure=Native.D("code",error.Code,"message","Input was interrupted; inspect the target before recovery.");if(error.Details!=null)failure["details"]=error.Details;receipt["error"]=failure;return receipt;}
   try{
    Check(r);Overlay.Stage("DSH 正在确认");long deadline=Now()+1500;Native.VisualFrame previous=null;Dictionary<string,object> previousFocus=null;bool stable=false;
    while(Now()<deadline){Check(r);Native.ValidateWindow(w,parent,true);Native.RECT captured;Native.VisualFrame frame;Dictionary<string,object> currentFocus=null;try{var e=AutomationElement.FocusedElement;if(Native.BelongsToWindow(e,snap.Hwnd,Convert.ToInt32(w["pid"]))){int budget=16000;currentFocus=Native.Element(e,"post-focus",ref budget);}}catch{}
     Overlay.Suspend();try{using(var b=Native.Capture(snap.Hwnd,out captured))frame=Native.Frame(b,captured,Native.NativeCaret(snap.Hwnd,captured,snap.Dpi));}finally{Overlay.Resume();}if(previous!=null&&Native.CompareFrame(previous,frame,previousFocus,currentFocus,snap.Dpi,frame.Capture).Passed){stable=true;break;}previous=frame;previousFocus=currentFocus;int wait=(int)Math.Min(80,Math.Max(0,deadline-Now()));if(wait>0)Thread.Sleep(wait);}
    var post=Observe(w,r,false,includeImage);if(!stable){Native.Obj(post["coverage"])["unstable"]=true;post["warnings"]=new[]{"Visual stability was not established within 1500 ms; this is not a business-completion signal."};}receipt["observation"]=post;
    if(text!=null&&focused!=null&&focused.ContainsKey("value")&&focused.ContainsKey("selectionStart")&&focused.ContainsKey("selectionEnd")&&!focused.ContainsKey("valueTruncated")){
     var current=post.ContainsKey("focusedElement")?Native.Obj(post["focusedElement"]):null;var before=(string)focused["value"];int a=Convert.ToInt32(focused["selectionStart"]),b=Convert.ToInt32(focused["selectionEnd"]);
     if(a>=0&&b>=a&&b<=before.Length&&current!=null&&current.ContainsKey("value")&&!current.ContainsKey("valueTruncated")&&Object.Equals(current["runtimeId"],focused["runtimeId"])){
      string expected=(before.Substring(0,a)+text+before.Substring(b)).Replace("\r\n","\n").Replace('\r','\n');string actual=((string)current["value"]).Replace("\r\n","\n").Replace('\r','\n');receipt["verification"]=expected==actual?"verified":"mismatch";receipt["reason"]="Complete focused-editor value compared with the observed selection replacement.";
     }
    }
   }catch{receipt["error"]=Native.D("code","POST_OBSERVE_FAILED","message","Input was sent; post-action observation unavailable. Do not replay input.");}
   return receipt;
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
