#!/usr/bin/env python3
"""Check native sqrt replacement against the host's independent float32 sqrtf."""
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
extern float __ieee754_sqrtf(float);
static unsigned long count;
static uint32_t bits(float value) {uint32_t b;memcpy(&b,&value,4);return b;}
static float value(uint32_t b) {float v;memcpy(&v,&b,4);return v;}
/* Volatile function pointer plus -fno-builtin-sqrtf keeps the oracle a call to
 * system sqrtf, separate from the candidate's __ieee754_sqrtf symbol. */
static float (*volatile oracle)(float)=sqrtf;
static int check(uint32_t input) {
 float x=value(input),want=oracle(x),got=__ieee754_sqrtf(x);count++;
 if(isnan(want) ? !isnan(got) : bits(want)!=bits(got)) {
  fprintf(stderr,"sqrt mismatch input=%08x want=%08x got=%08x\n",input,bits(want),bits(got));return 1;
 }
 return 0;
}
int main(void) {
 const uint32_t special[]={0,0x80000000,1,2,0x007fffff,0x00800000,
  0x00800001,0x3f7fffff,0x3f800000,0x3f800001,0x40800000,0x7f7fffff,
  0x7f800000,0xff800000,0x7fc00000,0xffc00000,0x7f800001,0xff800001,
  0xbf800000,0x80000001,0xff7fffff};
 for(unsigned i=0;i<sizeof(special)/sizeof(*special);i++) if(check(special[i])) return 1;
 // Float32 projection-domain inputs, using the production operation order.
 for(int y=37;y<=191;y++) for(int x=23;x<=177;x++) {
  float e=(x-100)/76.0f,n=(114-y)/76.0f,rr=e*e+n*n;
  if(rr<=1 && check(bits(1-rr))) return 1;
 }
 // Probe both neighbors of exact exponent boundaries across the normal range.
 const uint32_t mantissas[]={0,1,2,0x1fffff,0x3fffff,0x400000,0x7ffffd,0x7ffffe,0x7fffff};
 for(uint32_t exponent=1;exponent<255;exponent++)
  for(unsigned m=0;m<sizeof(mantissas)/sizeof(*mantissas);m++)
   if(check((exponent<<23)|mantissas[m])) return 1;
 // Deterministic positive finite bit patterns span the entire float exponent range.
 uint32_t random=0x928e43a7;
 for(unsigned i=0;i<1000000;i++) {
  random^=random<<13;random^=random>>17;random^=random<<5;
  uint32_t sample=random&0x7fffffff;
  if(sample<0x7f800000 && check(sample)) return 1;
 }
 // Dense deterministic subnormal samples, plus each power of two and neighbors.
 for(uint32_t m=1;m<0x800000;m+=31) if(check(m)) return 1;
 for(unsigned shift=0;shift<23;shift++) {
  uint32_t p=1u<<shift;
  if(check(p-1)||check(p)||check(p+1)) return 1;
 }
 printf("%lu\n",count);return 0;
}
'''


def main() -> None:
    folder = ROOT / '.tmp' / 'sqrt-test'
    folder.mkdir(parents=True, exist_ok=True)
    harness, executable = folder / 'oracle.c', folder / 'oracle'
    harness.write_text(HARNESS)
    subprocess.run(['cc', '-O2', '-ffp-contract=off', '-fno-builtin-sqrtf', str(harness),
                    str(ROOT / 'watchface/src/c/face.c'), '-lm', '-o', str(executable)], check=True)
    result = subprocess.run([str(executable)], check=True, capture_output=True, text=True)
    report = {'status': 'pass', 'comparisons': int(result.stdout.strip()),
              'oracle': 'System float32 sqrtf; exact result bits for non-NaNs; NaN classification otherwise',
              'coverage': ['projection grid', 'normal exponent boundaries', '1000000 deterministic bit samples',
                           'dense subnormal samples', 'signed zero, infinities, NaNs, negative inputs'],
              'boundary': 'Default round-to-nearest; floating-point exception flags and NaN payloads are outside the renderer contract.'}
    (ROOT / '.tmp/sqrt-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
