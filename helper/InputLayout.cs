using System;
using System.Collections.Generic;
using System.Linq;
namespace MK {
 public sealed class LayoutProbe {public IntPtr Layout,RootLayout,Focus;public uint Thread,RootThread;public bool IsIme;public bool? NativeMode;}
 public interface IInputLayoutPlatform {LayoutProbe Probe(bool foreground);IntPtr English();bool Request(IntPtr layout);long Now();void Wait(int ms,Action guard);}
 // One preparation per run. Subsequent targets/keys validate only, never switch again.
 public sealed class InputLayoutSession {
  bool prepared,attempted,changed;string from;IInputLayoutPlatform last;
  volatile Dictionary<string,object> report=Native.D("state","pending","from",null,"to",null,"current",null,"changed",false,"attempted",false,"verified",false,"restored",false,"targetThread",null,"foregroundThread",null,"imeNative",null,"reason","target-not-selected");
  public static string Format(IntPtr h){return "0x"+unchecked((uint)h.ToInt64()).ToString("X8");}
  public static bool English(LayoutProbe p){return p!=null&&unchecked((uint)p.Layout.ToInt64())==0x04090409&&unchecked((uint)p.RootLayout.ToInt64())==0x04090409&&!p.IsIme&&p.NativeMode!=true;}
  public Dictionary<string,object> Snapshot(){return new Dictionary<string,object>(report);}
  void Update(LayoutProbe p,string state,string reason){report=Native.D("state",state,"from",from,"to",p==null?null:Format(p.Layout),"current",p==null?null:Format(p.Layout),"changed",changed,"attempted",attempted,"verified",English(p),"restored",false,"targetThread",p==null?(object)null:p.Thread,"foregroundThread",p==null?(object)null:p.RootThread,"imeNative",p==null?(object)null:p.NativeMode,"reason",reason);}
  Failure Reject(LayoutProbe p,string reason){Update(p,"failed",reason);return new Failure("UNSUPPORTED_INPUT","not_sent",Native.D("stage","input-layout","check",reason,"requiredAction","manual-english","inputLayout",Snapshot()));}
  public void Ensure(IInputLayoutPlatform platform,Action guard){
   guard();var p=platform.Probe(true);last=platform;if(from==null)from=Format(p.Layout);
   if(prepared){if(!English(p))throw Reject(p,"english-required");Update(p,"ready","verified");return;}
   prepared=true;
   if(English(p)){Update(p,"ready","already-english");return;}
   IntPtr english=platform.English();if(english==IntPtr.Zero)throw Reject(p,"english-not-loaded");
   guard();attempted=true;Update(p,"pending","switch-requested");if(!platform.Request(english))throw Reject(p,"request-rejected");long deadline=platform.Now()+1000;uint thread=p.Thread,rootThread=p.RootThread;
   for(;;){guard();p=platform.Probe(true);if(p.Thread!=thread||p.RootThread!=rootThread)throw Reject(p,"target-thread-changed");if(Format(p.Layout)!=from)changed=true;if(English(p)){Update(p,"ready","switched");return;}if(platform.Now()>=deadline)throw Reject(p,"switch-timeout");platform.Wait(10,guard);}
  }
  public void Validate(IInputLayoutPlatform platform,Action guard){if(!prepared)throw Reject(null,"layout-not-prepared");guard();var p=platform.Probe(true);last=platform;if(!English(p))throw Reject(p,"english-required");Update(p,"ready","verified");}
  public Dictionary<string,object> Finish(){if(last==null)return Snapshot();try{var p=last.Probe(false);Update(p,English(p)?"ready":"failed",English(p)?"not-restored":"english-required");}catch{Update(null,"unknown","target-unavailable");}return Snapshot();}
 }
 public sealed class WindowsInputLayoutPlatform:IInputLayoutPlatform {
  readonly Dictionary<string,object> window;readonly int parent;readonly Action<Action> post;readonly Action<int,Action> pause;IntPtr focus;
  public WindowsInputLayoutPlatform(Dictionary<string,object> w,int pid,Action<Action> send,Action<int,Action> wait){window=w;parent=pid;post=send;pause=wait;}
  public LayoutProbe Probe(bool foreground){
   var h=Native.ValidateWindow(window,parent,foreground);if(foreground||Native.GetForegroundWindow()==h)focus=Native.ForegroundFocus(h);
   if(focus==IntPtr.Zero||!Native.IsWindow(focus)||Native.GetAncestor(focus,2)!=h)throw new Failure("FOCUS_MISMATCH");uint pid,rootPid;uint thread=Native.GetWindowThreadProcessId(focus,out pid),rootThread=Native.GetWindowThreadProcessId(h,out rootPid);if(thread==0||rootThread==0||pid!=rootPid)throw new Failure("TARGET_CHANGED");
   IntPtr layout=Native.GetKeyboardLayout(thread);return new LayoutProbe{Layout=layout,RootLayout=Native.GetKeyboardLayout(rootThread),Thread=thread,RootThread=rootThread,Focus=focus,IsIme=Native.ImmIsIME(layout),NativeMode=Native.NativeImeMode(focus)};
  }
  public IntPtr English(){return Native.EnglishLayout();}
  public bool Request(IntPtr layout){var p=Probe(true);bool accepted=false;post(delegate(){accepted=Native.PostInputLanguage(p.Focus,layout);});if(accepted&&p.RootThread!=p.Thread)post(delegate(){accepted=Native.PostInputLanguage(Native.ParseHwnd(Native.S(window,"hwnd")),layout);});return accepted;}
  public long Now(){return System.Diagnostics.Stopwatch.GetTimestamp()*1000/System.Diagnostics.Stopwatch.Frequency;}
  public void Wait(int ms,Action guard){pause(ms,guard);}
 }
}
