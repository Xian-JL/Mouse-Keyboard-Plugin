using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

namespace MK.Verification {
 public static class FeedbackRegression {
  static int checks;
  static void Assert(bool condition,string name){checks++;if(!condition)throw new Exception("Feedback regression: "+name);}
  static Dictionary<string,object> Editor(){return Native.D("ref","editor","runtimeId","uia.same-editor","name","Text editor","role","ControlType.Document","rect",Native.D("left",-80,"top",50,"width",120,"height",80),"enabled",true,"password",false,"editable",true,"multiline","unknown","value","","selectionStart",0,"selectionEnd",0);}
  static Bitmap Blank(){var b=new Bitmap(160,100,PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(b))g.Clear(Color.White);return b;}
  static Native.VisualFrame Draw(int x,int y,int width,int height,Native.RECT? caret=null){using(var b=Blank()){using(var g=Graphics.FromImage(b))g.FillRectangle(Brushes.Black,x,y,width,height);return Native.Frame(b,new Native.RECT{Left=-100,Top=40,Right=60,Bottom=140},caret);}}
  static bool Same(Native.VisualFrame a,Native.VisualFrame b,Dictionary<string,object> before,Dictionary<string,object> after,uint dpi){return Native.CompareFrame(a,b,before,after,dpi,a.Capture).Passed;}
  public static string Run(){
   checks=0;Native.VisualFrame baseline;using(var b=Blank())baseline=Native.Frame(b,new Native.RECT{Left=-100,Top=40,Right=60,Bottom=140});
   var before=Editor();var after=Editor();
   Assert(Same(baseline,baseline,null,null,96),"exact image with no UIA");
   var blink=Draw(30,20,2,20);
   Assert(baseline.Hash!=blink.Hash,"different hashes retained for snapshot binding");
   Assert(Same(baseline,blink,before,after,96),"WinUI blink with no hwndCaret");
   Assert(Same(blink,baseline,before,after,96),"blink on-to-off");
   Assert(!Same(baseline,blink,null,null,96),"unknown focus cannot tolerate changes");
   after["value"]="i";Assert(!Same(baseline,blink,before,after,96),"narrow glyph with changed text refused");after=Editor();
   after["selectionStart"]=1;after["selectionEnd"]=1;Assert(!Same(baseline,blink,before,after,96),"selection movement refused");after=Editor();
   before["value"]="abc";after["value"]="abc";before["selectionEnd"]=1;after["selectionEnd"]=1;Assert(!Same(baseline,blink,before,after,96),"matching noncollapsed selection refused");before=Editor();after=Editor();
   foreach(string key in new[]{"value","selectionStart","selectionEnd"}){after=Editor();after.Remove(key);Assert(!Same(baseline,blink,before,after,96),"missing "+key);}after=Editor();
   after["valueTruncated"]=true;Assert(!Same(baseline,blink,before,after,96),"truncated value refused");after=Editor();
   foreach(string key in new[]{"runtimeId","name","role","multiline"}){after=Editor();after[key]="changed";Assert(!Same(baseline,blink,before,after,96),"changed identity "+key);}after=Editor();
   Native.Obj(after["rect"])["left"]=-79;Assert(!Same(baseline,blink,before,after,96),"moved editor refused");after=Editor();
   after["password"]=true;Assert(!Same(baseline,blink,before,after,96),"password refused");after=Editor();
   after["enabled"]=false;Assert(!Same(baseline,blink,before,after,96),"disabled refused");after=Editor();
   after["editable"]=false;Assert(!Same(baseline,blink,before,after,96),"noneditable refused");after=Editor();
   Assert(!Same(baseline,Draw(30,20,4,20),before,after,96),"wide change refused");
   Assert(!Same(baseline,Draw(30,20,2,49),before,after,96),"tall change refused");
   Assert(!Same(baseline,Draw(30,20,1,3),before,after,96),"isolated pixel noise refused");
   Assert(!Same(baseline,Draw(2,2,2,20),before,after,96),"outside editor refused");
   using(var b=Blank()){b.SetPixel(30,20,Color.Black);b.SetPixel(30,30,Color.Black);Assert(!Same(baseline,Native.Frame(b,baseline.Capture),before,after,96),"disjoint vertical noise refused");}
   foreach(uint dpi in new uint[]{96,120,144,192}){
    int w=(int)Math.Ceiling(3*dpi/96.0),h=(int)Math.Ceiling(20*dpi/96.0);
    Assert(Same(baseline,Draw(30,20,w,h),before,after,dpi),"DPI bounded caret "+dpi);
    Assert(!Same(baseline,Draw(30,20,w+1,h),before,after,dpi),"DPI oversized caret "+dpi);
   }
   var captureShift=Draw(30,20,2,20);captureShift.Capture.Left--;
   Assert(!Same(baseline,captureShift,before,after,96),"capture coordinate shift refused");
   var caret=new Native.RECT{Left=-70,Top=60,Right=-68,Bottom=80};
   Native.VisualFrame maskedBlank;using(var b=Blank())maskedBlank=Native.Frame(b,baseline.Capture,caret);
   Assert(Same(maskedBlank,Draw(30,20,2,20,caret),null,null,96),"known native caret masking preserved");
   Assert(!Same(maskedBlank,baseline,before,after,96),"missing native caret is not masked blindly");
   var movedCaret=caret;movedCaret.Left++;movedCaret.Right++;
   Assert(!Same(maskedBlank,Draw(30,20,2,20,movedCaret),before,after,96),"changed native caret bounds refused");
   Assert(Native.CompareFrame(maskedBlank,baseline,null,null,96,new Native.RECT{Left=0,Top=110,Right=20,Bottom=130}).Passed,"unrelated native caret outside target ROI is not a global gate");
   for(int flags=0;flags<128;flags++){
    bool same=(flags&1)!=0,native=(flags&2)!=0,belongs=(flags&4)!=0,enabled=(flags&8)!=0,has=(flags&16)!=0,editable=(flags&32)!=0,focusable=(flags&64)!=0;
    // Independently enumerated allowed evidence sets; every other combination is denied.
    bool expected=Array.IndexOf(new[]{31,63,95,111,127},flags)>=0;
    Assert(Native.FocusEvidence(same,native,belongs,enabled,has,editable,focusable)==expected,"focus proof combination "+flags);
   }
   Assert(Native.FocusEvidence(true,true,true,true,false,true,true),"hosted focus flag false accepted with independent proof");
   foreach(int width in new[]{5,10,12})using(var b=Blank()){
    using(var g=Graphics.FromImage(b))g.FillRectangle(new SolidBrush(Color.FromArgb(253,254,255)),160-width,4,width,92);
    var frame=Native.Frame(b,baseline.Capture);var result=Native.CompareFrame(baseline,frame,before,after,192,baseline.Capture);
    Assert(result.Passed,"200-percent edge animation outside editor "+width);
    Assert(Convert.ToInt32(result.Details["maxChannelDelta"])==2,"small-channel delta report");
    Assert(Convert.ToInt32(result.Details["changedPixels"])==width*92,"edge diff count");
    Assert(Convert.ToInt32(Native.Obj(result.Details["diffBbox"])["left"])==60-width,"physical bbox with negative capture origin");
   }
   using(var b=Blank()){
    using(var g=Graphics.FromImage(b))g.Clear(Color.FromArgb(254,254,254));var frame=Native.Frame(b,baseline.Capture);
    Assert(Native.CompareFrame(baseline,frame,null,null,192,baseline.Capture).Passed,"whole-frame amplitude-one noise");
   }
   var edge=Draw(150,4,10,92);var roi=new Native.RECT{Left=-70,Top=60,Right=-30,Bottom=100};
   Assert(Native.CompareFrame(baseline,edge,null,null,192,roi).Passed,"unrelated edge outside element ROI");
   Assert(!Native.CompareFrame(baseline,edge,null,null,192,baseline.Capture).Passed,"coordinate full-frame significant edge rejected");
   Assert(!Native.CompareFrame(baseline,Draw(40,30,8,8),null,null,192,roi).Passed,"changed target ROI rejected");
   Assert(!Native.CompareFrame(baseline,Draw(30,20,120,80),null,null,192,baseline.Capture).Passed,"large real change refused");
   Assert(Native.ValidGeometry(-3840,-100,200,300),"valid negative monitor coordinates");
   foreach(double invalid in new[]{Double.NaN,Double.PositiveInfinity,Double.NegativeInfinity,(double)Int32.MinValue})Assert(!Native.ValidGeometry(invalid,0,10,10),"invalid UIA coordinate refused");
   Assert(!Native.ValidGeometry(0,0,0,10),"empty UIA rectangle refused");
   Assert(!Native.ValidGeometry(Int32.MaxValue-2,0,10,10),"UIA rectangle overflow refused");
   Assert(Native.MatchesQuery("Untitled - Notepad","Notepad.exe","记事本",new[]{"notepad.exe"}),"Chinese alias matches process");
   Assert(!Native.MatchesQuery("Other","Other.exe","记事本",new[]{"notepad.exe"}),"alias does not match unrelated app");
   var human=new InputArbiter();Assert(human.CanSend(0,0),"initial cooperation permits an idle action");
   Assert(!human.Key(65,true,false,100),"ordinary key is not emergency stop");
   Assert(!human.CanSend(human.Generation,1000),"held human key blocks input without ending run");
   human.Key(65,true,false,101);human.Key(65,false,false,110);
   Assert(!human.Quiet(359)&&human.Quiet(360),"key repeat and quiet boundary");
   Assert(!human.CanSend(0,1000),"human event invalidates old action generation");
   Assert(human.CanSend(human.Generation,1000),"new observation can act after human yields");
   human.Mouse(0x200,false,1100);Assert(!human.Quiet(1349)&&human.Quiet(1350),"mouse move cooperates without stop");
   human.Mouse(0x201,false,1400);Assert(!human.Quiet(2000),"held mouse button blocks action");human.Mouse(0x202,false,2010);
   Assert(human.Quiet(2260),"mouse release permits later action");
   long generation=human.Generation;Assert(!human.Key(27,true,true,2300)&&human.Generation==generation,"injected Esc cannot impersonate physical emergency");
   Assert(human.Key(27,true,false,2400),"physical Esc is emergency stop");
   human.Reset();Assert(human.CanSend(0,0),"fresh run resets arbitration references");
   int foregroundChecks=ForegroundRegression.Run();checks+=foregroundChecks;
   return "{\"ok\":true,\"mode\":\"feedback-pure-native-regression\",\"assertions\":"+checks+",\"foregroundChecks\":"+foregroundChecks+",\"userDesktopObserved\":false,\"visibleWindowsCreated\":false,\"inputSent\":false}";
  }
 }
}
