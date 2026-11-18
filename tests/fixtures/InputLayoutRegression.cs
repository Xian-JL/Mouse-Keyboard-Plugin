using System;
using System.Collections.Generic;
namespace MK.Verification {
 public static class InputLayoutRegression {
  sealed class Platform:IInputLayoutPlatform {
   public long Clock;public int Requests,After=20;public bool Available=true,Accept=true,Change=true,Gone,NativeMode,Ime;public uint Thread=1,RootThread=1;public IntPtr Layout=new IntPtr(0x08040804),Root=new IntPtr(0x08040804);
   public LayoutProbe Probe(bool foreground){if(Gone)throw new Failure("TARGET_GONE");if(Requests>0&&Change&&Clock>=After){Layout=new IntPtr(0x04090409);Root=Layout;}return new LayoutProbe{Layout=Layout,RootLayout=Root,Thread=Thread,RootThread=RootThread,IsIme=Ime,NativeMode=NativeMode};}
   public IntPtr English(){return Available?new IntPtr(0x04090409):IntPtr.Zero;}
   public bool Request(IntPtr layout){Requests++;return Accept;}
   public long Now(){return Clock;}public void Wait(int ms,Action guard){Clock+=ms;guard();}
  }
  static int checks;static void Assert(bool value,string message){checks++;if(!value)throw new Exception("InputLayout: "+message);}
  static void Rejected(Action action,string reason){try{action();Assert(false,"missing rejection "+reason);}catch(Failure e){Assert(e.Code=="UNSUPPORTED_INPUT"&&e.Execution=="not_sent"&&Object.Equals(e.Details["stage"],"input-layout"),"bounded not-sent manual rejection");Assert(Object.Equals(e.Details["check"],reason),"failure reason");}}
  public static int Run(){
   checks=0;var session=new InputLayoutSession();Assert(Object.Equals(session.Snapshot()["state"],"pending"),"begin remains pending without a target");var p=new Platform();session.Ensure(p,()=>{});Assert(p.Requests==1&&Object.Equals(session.Snapshot()["to"],"0x04090409")&&Object.Equals(session.Snapshot()["changed"],true),"Chinese to pure English is verified");session.Ensure(p,()=>{});session.Validate(p,()=>{});Assert(p.Requests==1,"observe and keyboard checks never request a second switch");var ended=session.Finish();Assert(Object.Equals(ended["restored"],false)&&p.Layout==new IntPtr(0x04090409),"end never restores or switches");
   var english=new Platform{Layout=new IntPtr(0x04090409),Root=new IntPtr(0x04090409)};new InputLayoutSession().Ensure(english,()=>{});Assert(english.Requests==0,"already English sends no request");
   p.Change=false;p.Layout=new IntPtr(0x08040804);p.Root=p.Layout;Rejected(()=>session.Validate(p,()=>{}),"english-required");Assert(p.Requests==1,"IME reversion cannot trigger another automatic switch");p.Layout=new IntPtr(0x04090409);p.Root=p.Layout;session.Ensure(p,()=>{});Assert(p.Requests==1,"manual recovery verified without another request");
   var missing=new Platform{Available=false};Rejected(()=>new InputLayoutSession().Ensure(missing,()=>{}),"english-not-loaded");Assert(missing.Requests==0,"missing layout is not loaded or installed");
   var denied=new Platform{Accept=false};var failed=new InputLayoutSession();Rejected(()=>failed.Ensure(denied,()=>{}),"request-rejected");Rejected(()=>failed.Ensure(denied,()=>{}),"english-required");Assert(denied.Requests==1,"rejected requests are not replayed");
   foreach(var bad in new[]{new Platform{Change=false},new Platform{NativeMode=true},new Platform{Ime=true}}){Rejected(()=>new InputLayoutSession().Ensure(bad,()=>{}),"switch-timeout");Assert(bad.Clock==1000&&bad.Requests==1,"bounded wait without typing or retries");}
   var cancelled=new Platform();try{new InputLayoutSession().Ensure(cancelled,()=>{if(cancelled.Clock>=10)throw new Failure("USER_STOPPED");});Assert(false,"Esc ignored");}catch(Failure e){Assert(e.Code=="USER_STOPPED"&&cancelled.Requests==1,"cancellation stops polling and sends no further request");}
   var beforePost=new Platform();int guards=0;try{new InputLayoutSession().Ensure(beforePost,()=>{if(++guards==2)throw new Failure("USER_BUSY");});Assert(false,"user activity ignored");}catch(Failure e){Assert(e.Code=="USER_BUSY"&&beforePost.Requests==0,"user activity before post prevents switching");}
   var threadChange=new Platform();Rejected(()=>new InputLayoutSession().Ensure(threadChange,()=>{if(threadChange.Clock>=10)threadChange.Thread=2;}),"target-thread-changed");
   var other=new Platform{Change=false};Rejected(()=>session.Ensure(other,()=>{}),"english-required");Assert(other.Requests==0,"new target thread requires English, not another automatic request");
   var gone=new InputLayoutSession();gone.Ensure(english,()=>{});english.Gone=true;Assert(Object.Equals(gone.Finish()["state"],"unknown")&&gone.Snapshot()["current"]==null,"unavailable target at end does not claim a current layout");
   Assert(!InputLayoutSession.English(new LayoutProbe{Layout=new IntPtr(0x00010409),RootLayout=new IntPtr(0x00010409)}),"Dvorak or alternate English is not pure US layout");Assert(!InputLayoutSession.English(new LayoutProbe{Layout=new IntPtr(0x04090409),RootLayout=new IntPtr(0x08040804)}),"foreground and focus threads must both be English");
   return checks;
  }
 }
}
