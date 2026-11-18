using System;
using System.Collections.Generic;
namespace MK.Verification {
 public static class InputLayoutRegression {
  sealed class Platform:IInputLayoutPlatform {
   public long Clock;public int Requests,After=20;public bool Available=true,Accept=true,Change=true,Gone,Ime;public bool? NativeMode=false;public bool ChangeRoot=true;public string Owner="process-one";public uint Thread=1,RootThread=1;public IntPtr Layout=new IntPtr(0x08040804),Root=new IntPtr(0x08040804);
   public LayoutProbe Probe(bool foreground){if(Gone)throw new Failure("TARGET_GONE");if(Requests>0&&Change&&Clock>=After){Layout=new IntPtr(0x04090409);if(ChangeRoot)Root=Layout;}return new LayoutProbe{Layout=Layout,RootLayout=Root,Thread=Thread,RootThread=RootThread,IsIme=Ime,NativeMode=NativeMode,Owner=Owner};}
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
   var timed=new Platform{Change=false};Rejected(()=>new InputLayoutSession().Ensure(timed,()=>{}),"switch-timeout");Assert(timed.Clock==1000&&timed.Requests==1,"Chinese timeout is bounded and not retried");
   foreach(var auxiliary in new[]{new Platform{NativeMode=null},new Platform{NativeMode=true},new Platform{Ime=true}}){var compatible=new InputLayoutSession();compatible.Ensure(auxiliary,()=>{});compatible.Validate(auxiliary,()=>{});Assert(Object.Equals(compatible.Snapshot()["state"],"ready")&&!Object.Equals(compatible.Snapshot()["verified"],true),"US HKL permits observation with an honest auxiliary warning");Assert(((string[])compatible.Snapshot()["warnings"]).Length>0&&auxiliary.Requests==1,"incomplete/conflicting IME evidence cannot cause a switch loop");}
   var rootChinese=new Platform{RootThread=2,ChangeRoot=false};var focused=new InputLayoutSession();focused.Ensure(rootChinese,()=>{});Assert(rootChinese.Root==new IntPtr(0x08040804)&&rootChinese.Layout==new IntPtr(0x04090409),"only target input thread changes");Assert(Object.Equals(focused.Snapshot()["verified"],true)&&Object.Equals(focused.Snapshot()["foregroundLayout"],"0x08040804"),"US focus verifies despite different root layout");Assert(((string[])focused.Snapshot()["warnings"])[0]=="foreground-layout-differs","root discrepancy is diagnostic only");
   var noContext=new Platform{NativeMode=false,RootThread=2,ChangeRoot=false};var contextless=new InputLayoutSession();contextless.Ensure(noContext,()=>{});Assert(Object.Equals(contextless.Snapshot()["verified"],true),"US without legacy context is valid");

   var cancelled=new Platform();try{new InputLayoutSession().Ensure(cancelled,()=>{if(cancelled.Clock>=10)throw new Failure("USER_STOPPED");});Assert(false,"Esc ignored");}catch(Failure e){Assert(e.Code=="USER_STOPPED"&&cancelled.Requests==1,"cancellation stops polling and sends no further request");}
   var beforePost=new Platform();int guards=0;try{new InputLayoutSession().Ensure(beforePost,()=>{if(++guards==2)throw new Failure("USER_BUSY");});Assert(false,"user activity ignored");}catch(Failure e){Assert(e.Code=="USER_BUSY"&&beforePost.Requests==0,"user activity before post prevents switching");}
   var threadChange=new Platform();Rejected(()=>new InputLayoutSession().Ensure(threadChange,()=>{if(threadChange.Clock>=10)threadChange.Thread=2;}),"target-thread-changed");
   var unrelated=new Platform{Thread=3,RootThread=3,Owner="other-process"};var other=new Platform{Thread=2,RootThread=2};session.Ensure(other,()=>{});Assert(other.Requests==1&&unrelated.Layout==new IntPtr(0x08040804)&&unrelated.Requests==0,"another authorized target is prepared independently, unrelated process untouched");session.Ensure(other,()=>{});Assert(other.Requests==1,"each input thread only prepares once");
   var reusedId=new Platform{Thread=2,RootThread=2,Owner="new-process-instance"};session.Ensure(reusedId,()=>{});Assert(reusedId.Requests==1,"thread ID reuse across process instances is not stale preparation");
   var newEnglish=new Platform{Thread=99,Layout=new IntPtr(0x04090409),Root=new IntPtr(0x08040804)};session.Validate(newEnglish,()=>{});Assert(newEnglish.Requests==0,"new already-English focus thread can validate without a switch");

   var gone=new InputLayoutSession();gone.Ensure(english,()=>{});english.Gone=true;Assert(Object.Equals(gone.Finish()["state"],"unknown")&&gone.Snapshot()["current"]==null,"unavailable target at end does not claim a current layout");
   Assert(!InputLayoutSession.English(new LayoutProbe{Layout=new IntPtr(0x00010409),RootLayout=new IntPtr(0x00010409)}),"Dvorak or alternate English is not pure US layout");Assert(InputLayoutSession.English(new LayoutProbe{Layout=new IntPtr(0x04090409),RootLayout=new IntPtr(0x08040804)}),"focus HKL is authoritative; root layout is auxiliary");
   var exact=new Platform{ChangeRoot=false,RootThread=4};var exactSession=new InputLayoutSession();exactSession.Ensure(exact,()=>{});exactSession.Validate(exact,()=>{});var text="mkTest 053, sample.";var output=new System.Text.StringBuilder();bool shift=false;
   var plan=new Humanizer(7,(c,l)=>new Native.ScanKey{Vk=(ushort)Char.ToUpperInvariant(c),Scan=(ushort)c,Shift=Char.IsUpper(c)}).Text(text,"auto","off",0,new IntPtr(0x04090409));
   foreach(var unit in plan.Units)Humanizer.Run(unit,events=>{foreach(var e in events){bool up=(e.U.ki.dwFlags&2)!=0;if(e.U.ki.wVk==16){shift=!up;continue;}if(!up)output.Append(shift?(char)e.U.ki.wVk:Char.ToLowerInvariant((char)e.U.ki.wVk));}},ms=>{},()=>exactSession.Validate(exact,()=>{}));
   Assert(output.ToString()==text,"inert production plan retains case, space and ASCII punctuation after layout preparation");Assert(Object.Equals(exactSession.Finish()["restored"],false)&&exact.Requests==1,"exact text run finishes without another language request");
   Assert(!InputLayoutSession.English(new LayoutProbe{Layout=new IntPtr(0x08040804),RootLayout=new IntPtr(0x04090409),NativeMode=false}),"no IMM context cannot authorize a Chinese HKL");
   return checks;
  }
 }
}
