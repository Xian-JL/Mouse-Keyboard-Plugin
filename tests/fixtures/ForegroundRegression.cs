using System;
using System.Collections.Generic;
using System.Linq;
namespace MK.Verification {
 public static class ForegroundRegression {
  sealed class Platform : IForegroundPlatform {
   public long Clock;public IntPtr Foreground {get;set;}public uint CurrentThread{get{return 30;}}
   public bool Iconic,RestoreWorks=true,DirectWorks,FallbackWorks=true,AcceptWithoutFocus,HungTarget,HungPrevious,ReleaseFails,RaiseThrows,SecondAttachThrows;
   public bool SameThreads;public int Activations,Restores;public List<string> Calls=new List<string>();public HashSet<uint> Attached=new HashSet<uint>();
   public Platform(){Foreground=new IntPtr(1);}
   public long Now {get{return Clock;}}
   public bool Minimized(IntPtr target){return Iconic;}
   public bool Hung(IntPtr target){return target==new IntPtr(2)?HungTarget:HungPrevious;}
   public uint ThreadOf(IntPtr target){return SameThreads?10u:target==new IntPtr(2)?20u:10u;}
   public void PrepareQueue(){Calls.Add("queue");}
   public void Restore(IntPtr target){Calls.Add("restore");Restores++;if(RestoreWorks)Iconic=false;}
   public bool Activate(IntPtr target){Calls.Add("activate");Activations++;bool works=Activations==1?DirectWorks:FallbackWorks;if(works)Foreground=target;return works||AcceptWithoutFocus;}
   public void Raise(IntPtr target){Calls.Add("raise");if(RaiseThrows)throw new InvalidOperationException("fixture raise failure");}
   public bool Attach(uint current,uint other,bool attach){Calls.Add((attach?"attach:":"detach:")+other);if(attach){if(SecondAttachThrows&&other==20)throw new InvalidOperationException("fixture attach failure");Attached.Add(other);return true;}Attached.Remove(other);return !ReleaseFails;}
   public void Sleep(int ms){if(Attached.Count>0)throw new Exception("Waited with shared input queues.");Clock+=ms;}
  }
  static int checks;
  static void Assert(bool value,string label){checks++;if(!value)throw new Exception("Foreground regression: "+label);}
  static bool Fails(Action action,string code){try{action();return false;}catch(Failure e){return e.Code==code;}}
  public static int Run(){
   checks=0;var target=new IntPtr(2);var p=new Platform{Foreground=target};Foreground.Bring(p,target,()=>{});Assert(p.Calls.Count==0,"already foreground is idempotent");
   p=new Platform{DirectWorks=true};Foreground.Bring(p,target,()=>{});Assert(p.Foreground==target&&p.Activations==1&&p.Attached.Count==0,"direct activation");
   p=new Platform{Iconic=true};Foreground.Bring(p,target,()=>{});Assert(p.Restores==1&&!p.Iconic&&p.Foreground==target,"minimized target restored before focus");
   Assert(p.Calls.IndexOf("restore")<p.Calls.IndexOf("activate"),"restore precedes focus request");
   Assert(p.Calls.Where(c=>c.StartsWith("detach:")).SequenceEqual(new[]{"detach:20","detach:10"}),"associations detached in reverse order");
   Assert(p.Attached.Count==0,"no residual input association");
   p=new Platform{Iconic=true,RestoreWorks=false};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"WINDOW_RESTORE_FAILED"),"restore timeout has its own code");Assert(p.Clock==500&&p.Activations==0,"failed restore does not attempt focus");
   p=new Platform{FallbackWorks=false};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"FOREGROUND_DENIED"),"OS denial is not success");Assert(p.Attached.Count==0&&p.Clock<=1100,"denied focus has bounded cleanup");
   p=new Platform{FallbackWorks=false,AcceptWithoutFocus=true};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"ACTIVATION_TIMEOUT"),"API accepted alone does not prove foreground");
   p=new Platform();Assert(Fails(()=>Foreground.Bring(p,target,()=>{if(p.Attached.Count>0)throw new Failure("USER_STOPPED");}),"USER_STOPPED"),"Esc interrupts associated path");Assert(p.Attached.Count==0&&!p.Calls.Contains("raise"),"cancel detaches and cannot raise later");
   p=new Platform();Assert(Fails(()=>Foreground.Bring(p,target,()=>{if(p.Clock>=40)throw new Failure("USER_BUSY");}),"USER_BUSY"),"human activity wins");Assert(p.Attached.Count==0&&!p.Calls.Contains("raise"),"human activity causes no late focus");
   p=new Platform{RaiseThrows=true};try{Foreground.Bring(p,target,()=>{});}catch(InvalidOperationException){}Assert(p.Attached.Count==0,"exception while raising still detaches");
   p=new Platform{SecondAttachThrows=true};try{Foreground.Bring(p,target,()=>{});}catch(InvalidOperationException){}Assert(p.Attached.Count==0&&p.Calls.Contains("detach:10"),"partial association cleanup");
   p=new Platform{ReleaseFails=true};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"CONTROL_CLOSE_FAILED"),"failed detach cannot claim safe success");Assert(p.Calls.Contains("detach:10")&&p.Calls.Contains("detach:20"),"one cleanup failure does not skip others");
   p=new Platform{SameThreads=true};Foreground.Bring(p,target,()=>{});Assert(p.Calls.Count(c=>c=="attach:10")==1,"same thread is attached only once");
   p=new Platform{HungTarget=true};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"ACTIVATION_TIMEOUT")&&p.Calls.Count==0,"hung target rejected before side effects");
   p=new Platform{HungPrevious=true};Assert(Fails(()=>Foreground.Bring(p,target,()=>{}),"ACTIVATION_TIMEOUT")&&p.Attached.Count==0,"hung source rejected before association");
   return checks;
  }
 }
}
