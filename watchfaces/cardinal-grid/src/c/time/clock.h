#pragma once
/*
 * time/  -  wall-clock text. Pure formatting; the app supplies the time and the
 * 12/24-hour preference, so this is testable off the watch.
 */
#include <stddef.h>
#include <stdbool.h>

/* "17:24" in 24-hour style ("07:05" keeps its zero); "5:24" in 12-hour style.
 * `out` must hold at least 6 bytes. */
void clock_format(char *out, size_t cap, int hour, int minute, bool h24);
