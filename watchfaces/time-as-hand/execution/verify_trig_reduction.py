#!/usr/bin/env python3
"""Verify the bounded newlib reducer with independent system-math oracles."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HARNESS = r'''
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
extern int __ieee754_rem_pio2f(float,float*);
extern void face_sun(int,int,int,float*,float*);
static unsigned long count;
static double max_remainder_error,max_trig_error,max_angle;
static int check(float x) {
 float parts[2];int n=__ieee754_rem_pio2f(x,parts),q;
 double half_pi=acos(-1.0)/2;
 double oracle=remquo((double)x,half_pi,&q),actual=(double)parts[0]+parts[1];
 double error=fabs(oracle-actual);
 if(error>max_remainder_error) max_remainder_error=error;
 if(fabs(actual)>half_pi/2+1e-14 || ((n-q)%8)!=0 || error>8e-15) {
  fprintf(stderr,"reduction mismatch x=%.9g n=%d q=%d remainder=%.17g want=%.17g\n",x,n,q,actual,oracle);return 1;
 }
 double s=sin(actual),c=cos(actual),rs,rc;
 switch((n%4+4)%4) {
  case 0:rs=s;rc=c;break;case 1:rs=c;rc=-s;break;
  case 2:rs=-s;rc=-c;break;default:rs=-c;rc=s;break;
 }
 double se=fabs(rs-sin((double)x)),ce=fabs(rc-cos((double)x));
 if(se>max_trig_error) max_trig_error=se;
 if(ce>max_trig_error) max_trig_error=ce;
 if(se>8e-15 || ce>8e-15) {fprintf(stderr,"sincos reconstruction mismatch %.9g\n",x);return 1;}
 count++;return 0;
}
static int angle(float x) {
 if(fabs(x)>max_angle) max_angle=fabs(x);
 if(!isfinite(x)||fabs(x)>=32) {fprintf(stderr,"renderer angle out of domain %.9g\n",x);return 1;}
 return 0;
}
int main(void) {
 double pi=acos(-1.0);
 if(check(0)||check(-0.0f)||check(nextafterf(0,1))||check(nextafterf(0,-1))) return 1;
 // Uniform full domain coverage, including values outside actual renderer needs.
 for(int i=-65535;i<=65535;i++) if(check(i/2048.0f)) return 1;
 // Neighboring float32 inputs around every quadrant and reduction switch boundary.
 for(int k=-40;k<=40;k++) {
  float center=(float)(k*pi/4),low=center,high=center;
  for(int step=0;step<17;step++) {
   if(check(low)||check(high)) return 1;
   low=nextafterf(low,-INFINITY);high=nextafterf(high,INFINITY);
  }
 }
 uint32_t random=0x03c147e9;
 for(unsigned i=0;i<1000000;i++) {
  random^=random<<13;random^=random>>17;random^=random<<5;
  float sample;memcpy(&sample,&random,4);
  if(isfinite(sample)&&fabsf(sample)<32 && check(sample)) return 1;
 }
 // Enumerate valid UTC day/minute values for common and leap years. These are
 // the time-domain inputs produced by watchface.c; arbitrary API arguments are
 // intentionally outside the internal helper's bounded-angle contract.
 for(int year=2026;year<=2028;year+=2) {
  int days=year==2028?366:365;
  for(int day=1;day<=days;day++) for(int minute=0;minute<1440;minute++) {
   float g=2*3.14159265358979323846f/days*(day-1+(minute/60.0f-12)/24);
   float dec,lon;face_sun(year,day,minute,&dec,&lon);
   if(angle(g)||angle(2*g)||angle(3*g)||angle(dec)||angle(lon)) return 1;
  }
 }
 // Valid hundredth-degree location coordinates cover projection trig inputs.
 for(int coordinate=-18000;coordinate<=18000;coordinate++)
  if(angle(coordinate*0.01f*(3.14159265358979323846f/180.0f))) return 1;
 printf("%lu %.17g %.17g %.9g\n",count,max_remainder_error,max_trig_error,max_angle);
 return 0;
}
'''


def main() -> None:
    folder = ROOT / '.tmp' / 'trig-reduction-test'
    folder.mkdir(parents=True, exist_ok=True)
    harness, executable = folder / 'oracle.c', folder / 'oracle'
    harness.write_text(HARNESS)
    subprocess.run(['cc', '-O2', '-ffp-contract=off', str(harness),
                    str(ROOT / 'watchface/src/c/face.c'), '-lm', '-o', str(executable)], check=True)
    result = subprocess.run([str(executable)], check=True, capture_output=True, text=True)
    count, remainder, trig, angle = result.stdout.split()
    report = {'status': 'pass', 'reduction_comparisons': int(count),
              'max_remainder_absolute_error': float(remainder),
              'max_reconstructed_sincos_absolute_error': float(trig),
              'max_renderer_angle_radians': float(angle),
              'oracles': ['system double remquo', 'system double sin/cos of original input'],
              'coverage': ['uniform domain grid', 'float32 neighbors of quadrant/reduction boundaries',
                           'deterministic finite bit patterns', 'signed zero/subnormals',
                           'every minute/day in common and leap years', 'valid location coordinates'],
              'boundary': 'Bounded finite inputs only; native newlib kernel linkage and hardware execution require device validation.'}
    (ROOT / '.tmp/trig-reduction-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
