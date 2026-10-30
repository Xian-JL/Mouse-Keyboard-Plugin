using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;

namespace MK {
 // Kept separate from the hook/overlay dispatcher. Tests supply a pure fake platform.
 public interface IForegroundPlatform {
  long Now {get;} IntPtr Foreground {get;} uint CurrentThread {get;}
  bool Minimized(IntPtr target);bool Hung(IntPtr target);uint ThreadOf(IntPtr target);
  void PrepareQueue();void Restore(IntPtr target);bool Activate(IntPtr target);void Raise(IntPtr target);
  bool Attach(uint current,uint other,bool attach);void Sleep(int milliseconds);
 }
 public static class Foreground {
  static Failure Failed(string code,string check,long started,IForegroundPlatform platform){return new Failure(code,"not_sent",Native.D("stage","window-activation","check",check,"activationAttempted",true,"waitedMs",Math.Max(0,platform.Now-started),"requiredAction","reobserve"));}
  static bool Wait(IForegroundPlatform platform,Func<bool> condition,Action guard,int timeout){
   long deadline=platform.Now+timeout;
   for(;;){guard();if(condition())return true;if(platform.Now>=deadline)return false;platform.Sleep((int)Math.Min(20,deadline-platform.Now));}
  }
  public static void Bring(IForegroundPlatform platform,IntPtr target,Action guard){
   long started=platform.Now;guard();
   if(platform.Hung(target))throw Failed("ACTIVATION_TIMEOUT","target-unresponsive",started,platform);
   if(platform.Minimized(target)){
    guard();platform.Restore(target);
    if(!Wait(platform,()=>!platform.Minimized(target),guard,500))throw Failed("WINDOW_RESTORE_FAILED","restore-timeout",started,platform);
   }
   guard();if(platform.Foreground==target)return;
   bool accepted=platform.Activate(target);
   if(Wait(platform,()=>platform.Foreground==target,guard,100))return;
   var attached=new List<uint>();uint current=platform.CurrentThread;
   try {
    guard();platform.PrepareQueue();IntPtr previous=platform.Foreground;
    if(previous!=IntPtr.Zero&&platform.Hung(previous))throw Failed("ACTIVATION_TIMEOUT","foreground-unresponsive",started,platform);
    var threads=new[]{previous==IntPtr.Zero?0:platform.ThreadOf(previous),platform.ThreadOf(target)}.Where(t=>t!=0&&t!=current).Distinct();
    foreach(uint other in threads){guard();if(platform.Attach(current,other,true))attached.Add(other);}
    guard();platform.Raise(target);guard();accepted=platform.Activate(target)||accepted;
   } finally {
    bool released=true;for(int i=attached.Count-1;i>=0;i--){try{released=platform.Attach(current,attached[i],false)&&released;}catch{released=false;}}
    if(!released)throw new Failure("CONTROL_CLOSE_FAILED","unknown",Native.D("stage","window-activation","check","input-association-release"));
   }
   // Never wait for focus while queues remain associated.
   if(!Wait(platform,()=>platform.Foreground==target&&!platform.Minimized(target),guard,500))throw Failed(accepted?"ACTIVATION_TIMEOUT":"FOREGROUND_DENIED",accepted?"activation-timeout":"activation-denied",started,platform);
  }
 }
 public sealed class WindowsForegroundPlatform : IForegroundPlatform {
  public long Now {get{return Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency;}}
  public IntPtr Foreground {get{return Native.GetForegroundWindow();}}
  public uint CurrentThread {get{return Native.GetCurrentThreadId();}}
  public bool Minimized(IntPtr target){return Native.IsIconic(target);}
  public bool Hung(IntPtr target){return Native.IsHungAppWindow(target);}
  public uint ThreadOf(IntPtr target){uint pid;return Native.GetWindowThreadProcessId(target,out pid);}
  public void PrepareQueue(){Native.MSG message;Native.PeekMessage(out message,IntPtr.Zero,0,0,0);}
  public void Restore(IntPtr target){Native.ShowWindowAsync(target,9);}
  public bool Activate(IntPtr target){return Native.SetForegroundWindow(target);}
  public void Raise(IntPtr target){Native.BringWindowToTop(target);}
  public bool Attach(uint current,uint other,bool attach){return Native.AttachThreadInput(current,other,attach);}
  public void Sleep(int milliseconds){Thread.Sleep(milliseconds);}
 }
}
