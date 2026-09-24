#include <pebble.h>
#include "face.h"
static Window *window;
static Layer *face;
static uint8_t *pixels;
static GBitmap *bitmap;
static uint8_t palette_argb[FACE_PALETTE_SIZE];
static AppTimer *render_timer;
static bool render_ready;
static int render_phase,render_row;
static int utc_year,utc_doy,utc_minute;
static uint32_t render_started;
static int hour,minute;
static int year,month,day,weekday;
static int date_mask,date_position;
static int latitude,longitude,location_valid;
/* 0/default font, automatic primary color, amber minute, automatic widths. */
static int style[5]={0,-1,-1,0,0};
enum { PERSIST_DATE_MASK=100, PERSIST_DATE_POSITION=101 };
static uint32_t milliseconds(void) {
 time_t seconds;uint16_t ms;time_ms(&seconds,&ms);
 return (uint32_t)seconds*1000u+ms;
}
static void read_time(struct tm *t) {
 year=t->tm_year+1900;month=t->tm_mon+1;day=t->tm_mday;weekday=t->tm_wday;
#ifdef TAH_TEST_MINUTE
 hour=TAH_TEST_MINUTE/60;minute=TAH_TEST_MINUTE%60;
#else
 hour=t->tm_hour;minute=t->tm_min;
#endif
}
static void render_step(void *context) {
 (void)context;render_timer=NULL;
 if(render_phase==0) {
 render_started=milliseconds();
 face_render_custom(hour,minute,TAH_EDITION,year,month,day,weekday,date_mask,date_position,style[0],style[1],style[2],style[3],style[4],pixels);
 APP_LOG(APP_LOG_LEVEL_INFO,"hands %lu ms",(unsigned long)(milliseconds()-render_started));
#if TAH_EDITION == 2
 time_t instant=time(NULL);
 /* Derive the few UTC fields directly from the epoch, without involving
  * civil-time structures or depending on timezone configuration. */
 unsigned utc_days=(unsigned)instant/86400u;
 utc_year=1970;
 for(;;) {
  unsigned span=365+(utc_year%4==0 && (utc_year%100!=0 || utc_year%400==0));
  if(utc_days<span) break;
  utc_days-=span;utc_year++;
 }
 utc_doy=utc_days+1;utc_minute=((unsigned)instant/60u)%1440u;
 render_phase=1;
#else
 render_phase=3;
#endif
 }
#if TAH_EDITION == 2
 else if(render_phase==1) {
  if(face_globe_prepare(latitude,longitude,2)) {render_phase=2;render_row=37;}
 } else if(render_phase==2) {
  int end=render_row+2;if(end>192) end=192;
  face_globe_overlay_rows(hour,minute,utc_year,utc_doy,utc_minute,latitude,longitude,location_valid,pixels,render_row,end);
  render_row=end;if(end==192) render_phase=3;
 }
#endif
 if(render_phase!=3) {render_timer=app_timer_register(1,render_step,NULL);return;}
 /* Reuse the renderer's buffer as a native bitmap. The next render clears
  * it back to palette indices, so no second full-screen buffer is needed. */
 for(int i=0;i<FACE_W*FACE_H;++i) pixels[i]=palette_argb[pixels[i]];
 render_ready=true;layer_mark_dirty(face);
 APP_LOG(APP_LOG_LEVEL_INFO,"frame ready %lu ms",(unsigned long)(milliseconds()-render_started));
}
static void request_render(void) {
 if(render_timer) app_timer_cancel(render_timer);
 render_ready=false;render_phase=0;
 render_timer=app_timer_register(1,render_step,NULL);
}
static void draw(Layer *layer,GContext *ctx) {
 (void)layer;
 graphics_context_set_fill_color(ctx,GColorWhite);
 graphics_fill_rect(ctx,GRect(0,0,FACE_W,FACE_H),0,GCornerNone);
 if(!render_ready) {
  graphics_context_set_text_color(ctx,GColorBlack);
  graphics_draw_text(ctx,"Loading...",fonts_get_system_font(FONT_KEY_GOTHIC_18),GRect(0,100,FACE_W,30),GTextOverflowModeTrailingEllipsis,GTextAlignmentCenter,NULL);
  return;
 }
 graphics_context_set_compositing_mode(ctx,GCompOpAssign);
 graphics_draw_bitmap_in_rect(ctx,bitmap,GRect(0,0,FACE_W,FACE_H));
}
static void tick(struct tm *t,TimeUnits changed) {
 /* Always obtain fresh local civil time when the clock ticks. */
 (void)t;(void)changed;time_t now=time(NULL);read_time(localtime(&now));request_render();
}
static void load(Window *w) {
 face=layer_create(GRect(0,0,FACE_W,FACE_H));layer_set_update_proc(face,draw);
 layer_add_child(window_get_root_layer(w),face);
 request_render();
}
static void unload(Window *w) { (void)w;layer_destroy(face); }
static void inbox(DictionaryIterator *iter,void *context) {
 (void)context;
 const uint32_t keys[]={MESSAGE_KEY_ShowWeekday,MESSAGE_KEY_ShowDay,MESSAGE_KEY_ShowMonth,MESSAGE_KEY_ShowYear};
 for(int i=0;i<4;++i) {
  Tuple *t=dict_find(iter,keys[i]);
  if(t && (t->type==TUPLE_INT || t->type==TUPLE_UINT)) {
   if(t->value->int32) date_mask|=1<<i;else date_mask&=~(1<<i);
  }
 }
 Tuple *p=dict_find(iter,MESSAGE_KEY_DatePosition);
 if(p && (p->type==TUPLE_INT || p->type==TUPLE_UINT) && (p->value->int32==0 || p->value->int32==1)) date_position=p->value->int32;
 persist_write_int(PERSIST_DATE_MASK,date_mask);
 persist_write_int(PERSIST_DATE_POSITION,date_position);
 const uint32_t style_keys[]={MESSAGE_KEY_TimeFont,MESSAGE_KEY_HandColor,MESSAGE_KEY_MinuteColor,MESSAGE_KEY_HandWidth,MESSAGE_KEY_MinuteWidth};
 const int lower[]={0,-1,-1,0,0},upper[]={11,8,8,5,5};
 for(int i=0;i<5;++i) {
  Tuple *t=dict_find(iter,style_keys[i]);
  if(t && (t->type==TUPLE_INT || t->type==TUPLE_UINT) && t->value->int32>=lower[i] && t->value->int32<=upper[i]) {
   style[i]=t->value->int32;persist_write_int(110+i,style[i]);
  }
 }
 /* New RGB keys are distinct from legacy palette-index keys. */
 const uint32_t rgb_keys[]={MESSAGE_KEY_HandColorRGB,MESSAGE_KEY_MinuteColorRGB};
 for(int i=0;i<2;++i) {
  Tuple *t=dict_find(iter,rgb_keys[i]);
  if(t && (t->type==TUPLE_INT || t->type==TUPLE_UINT) && t->value->int32>=0 && t->value->int32<=0xffffff) {
   uint32_t rgb=t->value->uint32;
   int r=(((rgb>>16)&255)+42)/85,g=(((rgb>>8)&255)+42)/85,b=((rgb&255)+42)/85;
   style[1+i]=10+r*16+g*4+b;persist_write_int(111+i,style[1+i]);
  }
 }
 Tuple *lat=dict_find(iter,MESSAGE_KEY_Latitude),*lon=dict_find(iter,MESSAGE_KEY_Longitude),*valid=dict_find(iter,MESSAGE_KEY_LocationValid);
 if(lat && lon && valid && (lat->type==TUPLE_INT || lat->type==TUPLE_UINT) && (lon->type==TUPLE_INT || lon->type==TUPLE_UINT) && (valid->type==TUPLE_INT || valid->type==TUPLE_UINT)
    && lat->value->int32>=-9000 && lat->value->int32<=9000 && lon->value->int32>=-18000 && lon->value->int32<=18000) {
  latitude=lat->value->int32;longitude=lon->value->int32;location_valid=valid->value->int32!=0;
  persist_write_int(120,latitude);persist_write_int(121,longitude);persist_write_int(122,location_valid);
 }
 request_render();
}
int main(void) {
 bitmap=gbitmap_create_blank(GSize(FACE_W,FACE_H),GBitmapFormat8Bit);
 if(!bitmap) return 1;
 /* The shared renderer uses a tightly packed rectangular buffer. */
 if(gbitmap_get_bytes_per_row(bitmap)!=FACE_W) {gbitmap_destroy(bitmap);return 1;}
 pixels=gbitmap_get_data(bitmap);
 for(int c=0;c<FACE_PALETTE_SIZE;++c)
  palette_argb[c]=GColorFromRGB(face_palette[c][0],face_palette[c][1],face_palette[c][2]).argb;
 latitude=persist_read_int(120);longitude=persist_read_int(121);location_valid=persist_read_int(122)!=0;
 if(latitude< -9000 || latitude>9000 || longitude< -18000 || longitude>18000) {latitude=0;longitude=0;location_valid=0;}
 date_mask=persist_exists(PERSIST_DATE_MASK) ? persist_read_int(PERSIST_DATE_MASK)&15 : 0;
 date_position=persist_exists(PERSIST_DATE_POSITION) && persist_read_int(PERSIST_DATE_POSITION)==1 ? 1 : 0;
 for(int i=0;i<5;++i) if(persist_exists(110+i)) style[i]=persist_read_int(110+i);
 time_t now=time(NULL);struct tm *t=localtime(&now);read_time(t);
 window=window_create();window_set_window_handlers(window,(WindowHandlers){.load=load,.unload=unload});
 window_stack_push(window,true);tick_timer_service_subscribe(MINUTE_UNIT,tick);
 app_message_register_inbox_received(inbox);app_message_open(256,64);
 app_event_loop();if(render_timer) app_timer_cancel(render_timer);app_message_deregister_callbacks();tick_timer_service_unsubscribe();window_destroy(window);gbitmap_destroy(bitmap);
}
