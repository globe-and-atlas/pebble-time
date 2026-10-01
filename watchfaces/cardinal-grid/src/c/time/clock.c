#include "clock.h"

void clock_format(char *out, size_t cap, int hour, int minute, bool h24) {
  if (cap < 6) {
    if (cap) out[0] = '\0';
    return;
  }
  if (!h24) {
    hour %= 12;
    if (hour == 0) hour = 12;
  }
  size_t n = 0;
  if (h24 || hour >= 10) out[n++] = (char)('0' + (hour / 10) % 10);
  out[n++] = (char)('0' + hour % 10);
  out[n++] = ':';
  out[n++] = (char)('0' + (minute / 10) % 10);
  out[n++] = (char)('0' + minute % 10);
  out[n] = '\0';
}
