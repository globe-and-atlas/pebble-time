#pragma once
/*
 * The GRIDCORE palette, restricted to the named 64-colour Emery entries (no
 * gradients, no dithering). Every colour used on screen is defined here.
 */
#include <pebble.h>

#define CG_BG        GColorBlack
#define CG_GRID      GColorLightGray      /* off-white grid: outer ring, ticks, labels */
#define CG_GRID_DIM  GColorDarkGray       /* inner rings, diagonal radials, minor ticks */
#define CG_AMBER     GColorChromeYellow   /* reference geometry: the north axis */
#define CG_TIN       GColorMidnightGreen  /* TIN edges, muted */
#define CG_FACET     GColorDarkGreen      /* lit terrain facets */
#define CG_COAST     GColorTiffanyBlue    /* generalised coastline */
#define CG_BOUNDARY  GColorCadetBlue      /* vector boundary (ridge line) */
#define CG_POINTER   GColorWhite          /* heading pointer and position marker */
#define CG_TEXT      GColorWhite          /* time */
#define CG_TEXT_DIM  GColorLightGray      /* status text */
