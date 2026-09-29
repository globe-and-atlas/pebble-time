// Host preview renderer: runs the watch's renderer on a tile and writes the
// raw 200x228 GColor8 frame plus the text list. tools/previews.py turns that
// into a PNG. These previews check layout and geometry during development;
// they are NOT emulator captures (system fonts are approximated).
//
//   host_render TILE OUT_PREFIX VIEW YAW EXAG_X10 [stale] [nophone]
//   host_render --status OUT_PREFIX TITLE HEADLINE DETAIL HINT PERCENT

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/c/fa_render.h"

static uint8_t s_fb[FA_SCREEN_H][FA_SCREEN_W];
static FaMeshCache s_mc;

static int write_out(const char *prefix, const FaTextList *tl) {
  char path[512];
  snprintf(path, sizeof path, "%s.raw", prefix);
  FILE *f = fopen(path, "wb");
  if (!f) return 1;
  fwrite(s_fb, 1, sizeof s_fb, f);
  fclose(f);
  snprintf(path, sizeof path, "%s.txt", prefix);
  f = fopen(path, "w");
  if (!f) return 1;
  for (int i = 0; i < tl->count; i++) {
    const FaText *t = &tl->items[i];
    fprintf(f, "%d %d %d %d %u %u %u %u %s\n", t->x, t->y, t->w, t->h, t->font, t->align, t->color, t->bg, t->text);
  }
  fclose(f);
  return 0;
}

int main(int argc, char **argv) {
  FaCanvas c = {&s_fb[0][0], FA_SCREEN_W, FA_SCREEN_W, FA_SCREEN_H};
  FaTextList tl;
  if (argc >= 8 && !strcmp(argv[1], "--status")) {
    fa_render_status(&c, argv[3], argv[4], argv[5], argv[6], (uint8_t)atoi(argv[7]), &tl);
    return write_out(argv[2], &tl);
  }
  if (argc < 6) {
    fprintf(stderr, "usage: host_render TILE OUT VIEW YAW EXAG [stale] [nophone]\n");
    return 2;
  }
  static uint8_t buf[FA_MAX_TILE_BYTES + 1];
  FILE *f = fopen(argv[1], "rb");
  if (!f) return 1;
  uint32_t len = (uint32_t)fread(buf, 1, sizeof buf, f);
  fclose(f);
  FaTile t;
  FaStatus st = fa_tile_parse(buf, len, &t);
  if (st != FA_OK) {
    fprintf(stderr, "tile rejected: %s\n", fa_status_name(st));
    return 1;
  }
  FaViewState vs = {0};
  vs.view = (FaView)atoi(argv[3]);
  vs.yaw = (uint8_t)atoi(argv[4]);
  vs.exag_x10 = (uint8_t)atoi(argv[5]);
  vs.site_count = 1;
  for (int i = 6; i < argc; i++) {
    if (!strcmp(argv[i], "stale")) vs.stale = true;
    if (!strcmp(argv[i], "nophone")) vs.phone_lost = true;
  }
  fa_mesh_prepare(&t, vs.exag_x10, &s_mc);
  fa_render_view(&c, &t, &s_mc, &vs, &tl);
  return write_out(argv[2], &tl);
}
