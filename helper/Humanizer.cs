using System;
using System.Collections.Generic;
using System.Linq;
namespace MK {
 public sealed class OwnedInputs {
  readonly HashSet<string> down=new HashSet<string>();readonly Dictionary<string,Native.INPUT> releases=new Dictionary<string,Native.INPUT>();public int Count {get{return down.Count;}}
  void Forget(string key){down.Remove(key);releases.Remove(key);}
  public void Record(Native.INPUT[] events,int count){if(count<0||count>events.Length)throw new Failure("PROTOCOL_ERROR");for(int i=0;i<count;i++){var e=events[i];if(e.type==1){string key=((e.U.ki.dwFlags&4)!=0?"u:":"v:")+((e.U.ki.dwFlags&4)!=0?e.U.ki.wScan:e.U.ki.wVk);if((e.U.ki.dwFlags&2)!=0)Forget(key);else{down.Add(key);var up=e;up.U.ki.dwFlags|=2;releases[key]=up;}}else if(e.type==0){if((e.U.mi.dwFlags&2)!=0){down.Add("mouse");var up=e;up.U.mi.dwFlags=4;releases["mouse"]=up;}if((e.U.mi.dwFlags&4)!=0)Forget("mouse");}}}
  public bool OwnsVirtual(int key){if(down.Contains("v:"+key)||key==1&&down.Contains("mouse")||key==231&&down.Any(k=>k.StartsWith("u:")))return true;return (key==160||key==161)&&down.Contains("v:16")||(key==162||key==163)&&down.Contains("v:17");}
  public void Release(Func<Native.INPUT,uint> send,Func<int,bool> physical){bool failed=false;foreach(var key in down.ToArray()){if(key=="mouse"?physical(1):key.StartsWith("v:")&&physical(Int32.Parse(key.Substring(2)))){Forget(key);continue;}try{if(send(releases[key])==1)Forget(key);else failed=true;}catch{failed=true;}}if(failed)throw new Failure("CONTROL_CLOSE_FAILED","unknown");}
 }
 public sealed class InputStep {public Native.INPUT[] Inputs;public int DelayBeforeMs;}
 public sealed class KeyUnit {public List<InputStep> Steps=new List<InputStep>();public int Utf16Offset;}
 public sealed class KeyboardPlan {public List<KeyUnit> Units=new List<KeyUnit>();public int DelayMs;}
 public sealed class MotionFrame {public Native.POINT Point;public int DelayBeforeMs;}
 public sealed class MotionPlan {public List<MotionFrame> Frames=new List<MotionFrame>();public Native.POINT Target;public int HoldMs,DelayMs;public bool Overshoot;}
 // Pure plans: no input, timers, idle motion, text editing or injection-marker changes.
 public sealed class Humanizer {
  public const int MaxDelayMs=20000;readonly Random random;
  public Humanizer():this(Guid.NewGuid().GetHashCode()){} public Humanizer(int seed){random=new Random(seed);}
  int Between(int a,int b){return random.Next(a,b+1);} int Triangle(int a,int b){return (int)Math.Round(a+(b-a)*(random.NextDouble()+random.NextDouble())/2);}
  static bool On(string p){return p!="off";} static void Profile(string p){if(p!="off"&&p!="natural"&&p!="slow")throw new Failure("INVALID_ARGUMENT");}
  public static void Budget(int ms){if(ms>MaxDelayMs)throw new Failure("HUMANIZE_BUDGET_EXCEEDED","not_sent",Native.D("stage","humanization","check","duration-budget","plannedDelayMs",ms,"budgetMs",MaxDelayMs,"requiredAction","split-text-or-select-off"));}
  int Gap(string profile,int? pace,char next){if(!On(profile))return pace??0;double gap=(pace.HasValue?pace.Value:Triangle(60,110))*(.7+.6*random.NextDouble());if(Char.IsPunctuation(next)||Char.IsUpper(next))gap+=Between(40,90);if(random.NextDouble()<.05)gap+=Between(250,600);return (int)Math.Round(gap*(profile=="slow"?1.6:1));}
  List<InputStep> Schedule(Native.INPUT[] inputs,string profile,int gap,bool pair=false){
   var steps=new List<InputStep>();if(!On(profile)||pair){steps.Add(new InputStep{Inputs=inputs,DelayBeforeMs=gap});return steps;}
   for(int i=0;i<inputs.Length;i++){int delay=i==0?gap:0;var prior=i==0?new Native.INPUT():inputs[i-1];var current=inputs[i];bool up=(current.U.ki.dwFlags&2)!=0,priorMod=prior.type==1&&(prior.U.ki.wVk==16||prior.U.ki.wVk==17),mod=current.type==1&&(current.U.ki.wVk==16||current.U.ki.wVk==17);if(i>0)delay=up&&!mod?Between(35,60):priorMod||mod?Between(10,40):Between(10,25);if(profile=="slow"&&i>0)delay=(int)Math.Round(delay*1.2);steps.Add(new InputStep{Inputs=new[]{current},DelayBeforeMs=delay});}return steps;
  }
  public KeyboardPlan Text(string text,string mode,string profile,int? pace,IntPtr layout){
   Profile(profile);if(pace.HasValue&&(pace<0||pace>400))throw new Failure("INVALID_ARGUMENT");if(mode!="auto"&&mode!="unicode"&&mode!="scancode")throw new Failure("INVALID_ARGUMENT");text=Native.ValidateText(text);var result=new KeyboardPlan();
   for(int offset=0;offset<text.Length;){int start=offset;char c=text[offset++];bool pair=Char.IsHighSurrogate(c);var input=new List<Native.INPUT>();
    if(c=='\n'){input.Add(Native.Key(13,false));input.Add(Native.Key(13,true));}
    else if(mode!="unicode"&&c<128){var key=Native.Scancode(c,layout);if(key==null)throw new Failure("UNSUPPORTED_INPUT","not_sent",Native.D("stage","native-validation","check","scancode-unmappable"));input.AddRange(Native.ScanInputs(key));}
    else{if(mode=="scancode")throw new Failure("UNSUPPORTED_INPUT");input.Add(Native.Unicode(c,false));input.Add(Native.Unicode(c,true));if(pair){char low=text[offset++];input.Add(Native.Unicode(low,false));input.Add(Native.Unicode(low,true));}}
    int gap=start==0?(On(profile)&&(Char.IsUpper(c)||Char.IsPunctuation(c))?Between(40,90):0):Gap(profile,pace,c);if(pair&&On(profile))gap+=Between(35,60);var unit=new KeyUnit{Utf16Offset=start,Steps=Schedule(input.ToArray(),profile,gap,pair)};result.DelayMs+=unit.Steps.Sum(s=>s.DelayBeforeMs);Budget(result.DelayMs);result.Units.Add(unit);
   }return result;
  }
  public KeyboardPlan Key(string key,string profile){Profile(profile);var keys=Native.Keys(key);var input=new List<Native.INPUT>();foreach(var k in keys)input.Add(Native.Key(k,false));foreach(var k in keys.Reverse())input.Add(Native.Key(k,true));var result=new KeyboardPlan();var unit=new KeyUnit{Steps=Schedule(input.ToArray(),profile,On(profile)&&keys.Length>1?Between(30,80):0)};result.DelayMs=unit.Steps.Sum(s=>s.DelayBeforeMs);result.Units.Add(unit);return result;}
  static Native.POINT Clamp(Native.POINT p,Native.RECT r){return new Native.POINT{X=Math.Max(r.Left,Math.Min(r.Right-1,p.X)),Y=Math.Max(r.Top,Math.Min(r.Bottom-1,p.Y))};}
  static double Distance(Native.POINT a,Native.POINT b){return Math.Sqrt(Math.Pow((double)b.X-a.X,2)+Math.Pow((double)b.Y-a.Y,2));} static bool Same(Native.POINT a,Native.POINT b){return a.X==b.X&&a.Y==b.Y;}
  void Curve(MotionPlan plan,Native.POINT from,Native.POINT to,Native.RECT bounds,string profile){
   double d=Distance(from,to);if(d<.5)return;double dx=(double)to.X-from.X,dy=(double)to.Y-from.Y,bend=d*(.03+.12*random.NextDouble())*(random.Next(2)==0?-1:1),c1x=from.X+dx/3-dy/d*bend,c1y=from.Y+dy/3+dx/d*bend,c2x=from.X+2*dx/3-dy/d*bend*.65,c2y=from.Y+2*dy/3+dx/d*bend*.65;
   int samples=d<8?Math.Max(1,(int)d):Between(8,25);var previous=from;
   for(int i=1;i<=samples;i++){double t=(double)i/samples;t=t*t*(3-2*t);double u=1-t;var coarse=Clamp(new Native.POINT{X=(int)Math.Round(u*u*u*from.X+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*to.X),Y=(int)Math.Round(u*u*u*from.Y+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*to.Y)},bounds);int pieces=Math.Max(1,(int)Math.Ceiling(Distance(previous,coarse)/6));var segment=previous;
    for(int j=1;j<=pieces;j++){var p=Clamp(new Native.POINT{X=(int)Math.Round(segment.X+(double)(coarse.X-segment.X)*j/pieces),Y=(int)Math.Round(segment.Y+(double)(coarse.Y-segment.Y)*j/pieces)},bounds);if(Same(p,previous))continue;int delay=Between(8,15);if(profile=="slow")delay=(int)Math.Round(delay*1.4);plan.Frames.Add(new MotionFrame{Point=p,DelayBeforeMs=delay});plan.DelayMs+=delay;Budget(plan.DelayMs);previous=p;}
   }
  }
  public MotionPlan MovePath(Native.POINT from,Native.POINT requested,Native.RECT bounds,Native.RECT targetBounds,string profile,bool jitter){
   Profile(profile);if(bounds.Right<=bounds.Left||bounds.Bottom<=bounds.Top||targetBounds.Right<=targetBounds.Left||targetBounds.Bottom<=targetBounds.Top)throw new Failure("INVALID_COORDINATE");var plan=new MotionPlan{Target=requested};if(!On(profile)){plan.Frames.Add(new MotionFrame{Point=requested});return plan;}
   if(jitter)plan.Target=Clamp(new Native.POINT{X=requested.X+Between(-2,2),Y=requested.Y+Between(-2,2)},targetBounds);
   double angle=random.NextDouble()*Math.PI*2;int radius=Between(10,25);var near=Clamp(new Native.POINT{X=plan.Target.X+(int)Math.Round(Math.Cos(angle)*radius),Y=plan.Target.Y+(int)Math.Round(Math.Sin(angle)*radius)},bounds);Curve(plan,from,near,bounds,profile);int before=plan.Frames.Count,hover=Between(80,200);var end=plan.Target;int amount=Between(3,8);var over=Clamp(new Native.POINT{X=end.X+(int)Math.Round(Math.Cos(angle)*amount),Y=end.Y+(int)Math.Round(Math.Sin(angle)*amount)},targetBounds);
   if(random.NextDouble()<.3&&!Same(over,end)){plan.Overshoot=true;Curve(plan,near,over,bounds,profile);Curve(plan,over,end,bounds,profile);}else Curve(plan,near,end,bounds,profile);
   if(plan.Frames.Count==before)plan.Frames.Add(new MotionFrame{Point=end});plan.Frames[before].DelayBeforeMs+=hover;plan.DelayMs+=hover;plan.HoldMs=Between(60,120);plan.DelayMs+=plan.HoldMs;Budget(plan.DelayMs);return plan;
  }
  // The same runner is used with an inert sink and virtual clock by regression tests.
  public static void Run(KeyUnit unit,Action<Native.INPUT[]> send,Action<int> pause,Action validate){foreach(var step in unit.Steps){pause(step.DelayBeforeMs);validate();send(step.Inputs);}}
 }
}
