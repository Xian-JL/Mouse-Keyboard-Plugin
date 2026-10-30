using System;
using System.Threading;
namespace MK {
 public sealed class InputArbiter {
  readonly int[] keys=new int[256];int held,buttons;long generation,lastInput=-1000000;
  public long Generation {get{return Interlocked.Read(ref generation);}}
  public void Reset(){for(int i=0;i<keys.Length;i++)Interlocked.Exchange(ref keys[i],0);Interlocked.Exchange(ref held,0);Interlocked.Exchange(ref buttons,0);Interlocked.Exchange(ref generation,0);Interlocked.Exchange(ref lastInput,-1000000);}
  void Touch(long now){Interlocked.Exchange(ref lastInput,now);Interlocked.Increment(ref generation);}
  public bool Key(int key,bool down,bool injected,long now){if(injected)return false;Touch(now);if(key>=0&&key<256){int previous=Interlocked.Exchange(ref keys[key],down?1:0);if(previous!=(down?1:0))Interlocked.Add(ref held,down?1:-1);}return key==27&&down;}
  public void Mouse(int message,bool injected,long now){if(injected)return;Touch(now);int bit=0;bool down=false;
   switch(message){case 0x201:bit=1;down=true;break;case 0x202:bit=1;break;case 0x204:bit=2;down=true;break;case 0x205:bit=2;break;case 0x207:bit=4;down=true;break;case 0x208:bit=4;break;case 0x20B:bit=8;down=true;break;case 0x20C:bit=8;break;}
   if(bit!=0){int prior,next;do{prior=Volatile.Read(ref buttons);next=down?prior|bit:prior&~bit;}while(Interlocked.CompareExchange(ref buttons,next,prior)!=prior);}
  }
  public bool Quiet(long now){return Volatile.Read(ref held)==0&&Volatile.Read(ref buttons)==0&&now-Interlocked.Read(ref lastInput)>=250;}
  public bool CanSend(long observedGeneration,long now){return observedGeneration==Generation&&Quiet(now);}
 }
}
