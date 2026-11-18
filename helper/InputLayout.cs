using System;
using System.Collections.Generic;
using System.Linq;
namespace MK {
 public sealed class LayoutProbe {public IntPtr Layout,RootLayout,Focus;public uint Thread,RootThread;public bool IsIme;public bool? NativeMode;public string Owner;}
 public interface IInputLayoutPlatform {LayoutProbe Probe(bool foreground);IntPtr English();bool Request(IntPtr layout);long Now();void Wait(int ms,Action guard);}
 // Each validated input thread gets one preparation opportunity in this run.
 public sealed class InputLayoutSession {
  sealed class Preparation {public bool Attempted,Changed;public string From;}
  readonly Dictionary<string,Preparation> prepared=new Dictionary<string,Preparation>();Preparation selected;IInputLayoutPlatform last;
  volatile Dictionary<string,object> report=Native.D("state","pending","from",null,"to",null,"current",null,"foregroundLayout",null,"changed",false,"attempted",false,"verified",false,"restored",false,"targetThread",null,"foregroundThread",null,"imeNative",null,"warnings",new string[0],"reason","target-not-selected");
  public static string Format(IntPtr h){return "0x"+unchecked((uint)h.ToInt64()).ToString("X8");}
  public static bool English(LayoutProbe p){return p!=null&&unchecked((uint)p.Layout.ToInt64())==0x04090409;}
  static string Key(LayoutProbe p){return (p.Owner??"")+"|"+p.Thread;}
  public Dictionary<string,object> Snapshot(){var copy=new Dictionary<string,object>(report);copy["warnings"]=((string[])copy["warnings"]).Clone();return copy;}
  void Update(LayoutProbe p,string state,string reason){
   var warnings=new List<string>();if(p!=null){if(p.RootLayout!=p.Layout)warnings.Add("foreground-layout-differs");if(!p.NativeMode.HasValue)warnings.Add("ime-evidence-incomplete");if(p.IsIme||p.NativeMode==true)warnings.Add("ime-evidence-conflicts");if(selected!=null&&selected.Attempted&&Format(p.Layout)!=selected.From)selected.Changed=true;}
   report=Native.D("state",state,"from",selected==null?null:selected.From,"to",p==null?null:Format(p.Layout),"current",p==null?null:Format(p.Layout),"foregroundLayout",p==null?null:Format(p.RootLayout),"changed",selected!=null&&selected.Changed,"attempted",selected!=null&&selected.Attempted,"verified",English(p)&&!p.IsIme&&p.NativeMode==false,"restored",false,"targetThread",p==null?(object)null:p.Thread,"foregroundThread",p==null?(object)null:p.RootThread,"imeNative",p==null?(object)null:p.NativeMode,"warnings",warnings.ToArray(),"reason",reason);
  }
  Failure Reject(LayoutProbe p,string reason){Update(p,"failed",reason);return new Failure("UNSUPPORTED_INPUT","not_sent",Native.D("stage","input-layout","check",reason,"requiredAction","manual-english","inputLayout",Snapshot()));}
  public void Ensure(IInputLayoutPlatform platform,Action guard){
   guard();var p=platform.Probe(true);last=platform;string key=Key(p);
   if(prepared.TryGetValue(key,out selected)){if(!English(p))throw Reject(p,"english-required");Update(p,"ready","verified");return;}
   selected=new Preparation{From=Format(p.Layout)};prepared.Add(key,selected);
   if(English(p)){Update(p,"ready","already-english");return;}
   IntPtr english=platform.English();if(english==IntPtr.Zero)throw Reject(p,"english-not-loaded");
   guard();selected.Attempted=true;Update(p,"pending","switch-requested");if(!platform.Request(english))throw Reject(p,"request-rejected");long deadline=platform.Now()+1000;uint thread=p.Thread;
   for(;;){guard();p=platform.Probe(true);if(p.Thread!=thread||Key(p)!=key)throw Reject(p,"target-thread-changed");if(English(p)){Update(p,"ready","switched");return;}if(platform.Now()>=deadline)throw Reject(p,"switch-timeout");platform.Wait(10,guard);}
  }
  public void Validate(IInputLayoutPlatform platform,Action guard){guard();var p=platform.Probe(true);last=platform;if(!prepared.TryGetValue(Key(p),out selected)){if(!English(p))throw Reject(p,"layout-not-prepared");selected=new Preparation{From=Format(p.Layout)};prepared.Add(Key(p),selected);}if(!English(p))throw Reject(p,"english-required");Update(p,"ready","verified");}
  public Dictionary<string,object> Finish(){if(last==null)return Snapshot();try{var p=last.Probe(false);prepared.TryGetValue(Key(p),out selected);Update(p,English(p)?"ready":"failed",English(p)?"not-restored":"english-required");}catch{Update(null,"unknown","target-unavailable");}return Snapshot();}
 }
 public sealed class WindowsInputLayoutPlatform:IInputLayoutPlatform {
  readonly Dictionary<string,object> window;readonly int parent;readonly Action<Action> post;readonly Action<int,Action> pause;IntPtr focus;
  public WindowsInputLayoutPlatform(Dictionary<string,object> w,int pid,Action<Action> send,Action<int,Action> wait){window=w;parent=pid;post=send;pause=wait;}
  public LayoutProbe Probe(bool foreground){
   var h=Native.ValidateWindow(window,parent,foreground);if(foreground||Native.GetForegroundWindow()==h)focus=Native.ForegroundFocus(h);
   if(focus==IntPtr.Zero||!Native.IsWindow(focus)||Native.GetAncestor(focus,2)!=h)throw new Failure("FOCUS_MISMATCH");uint pid,rootPid;uint thread=Native.GetWindowThreadProcessId(focus,out pid),rootThread=Native.GetWindowThreadProcessId(h,out rootPid);if(thread==0||rootThread==0||pid!=rootPid)throw new Failure("TARGET_CHANGED");
   IntPtr layout=Native.GetKeyboardLayout(thread);return new LayoutProbe{Layout=layout,RootLayout=Native.GetKeyboardLayout(rootThread),Thread=thread,RootThread=rootThread,Focus=focus,Owner=Convert.ToString(window["pid"],System.Globalization.CultureInfo.InvariantCulture)+"|"+Native.S(window,"created"),IsIme=Native.ImmIsIME(layout),NativeMode=Native.NativeImeMode(focus)};
  }
  public IntPtr English(){return Native.EnglishLayout();}
  public bool Request(IntPtr layout){var p=Probe(true);bool accepted=false;post(delegate(){accepted=Native.PostInputLanguage(p.Focus,layout);});return accepted;}
  public long Now(){return System.Diagnostics.Stopwatch.GetTimestamp()*1000/System.Diagnostics.Stopwatch.Frequency;}
  public void Wait(int ms,Action guard){pause(ms,guard);}
 }
}
