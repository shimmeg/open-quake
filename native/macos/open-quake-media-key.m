#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <IOKit/hidsystem/IOLLEvent.h>
#import <IOKit/hidsystem/ev_keymap.h>
#include <string.h>
#include <unistd.h>

static int keyTypeForCommand(const char *command) {
  if (strcmp(command, "playpause") == 0) return NX_KEYTYPE_PLAY;
  if (strcmp(command, "next") == 0) return NX_KEYTYPE_NEXT;
  if (strcmp(command, "previous") == 0) return NX_KEYTYPE_PREVIOUS;
  if (strcmp(command, "volume-up") == 0) return NX_KEYTYPE_SOUND_UP;
  if (strcmp(command, "volume-down") == 0) return NX_KEYTYPE_SOUND_DOWN;
  if (strcmp(command, "mute") == 0) return NX_KEYTYPE_MUTE;
  return -1;
}

static BOOL postKeyEvent(int keyType, BOOL keyDown) {
  int data1 = (keyType << 16) | (keyDown ? 0x0A00 : 0x0B00);
  NSEvent *event = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                      location:NSZeroPoint
                                 modifierFlags:0
                                     timestamp:0
                                  windowNumber:0
                                       context:nil
                                       subtype:NX_SUBTYPE_AUX_CONTROL_BUTTONS
                                         data1:data1
                                         data2:-1];
  if (!event.CGEvent) return NO;
  CGEventPost(kCGHIDEventTap, event.CGEvent);
  return YES;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) {
      fprintf(stderr, "usage: open-quake-media-key <playpause|next|previous|volume-up|volume-down|mute>\n");
      return 64;
    }

    int keyType = keyTypeForCommand(argv[1]);
    if (keyType < 0) {
      fprintf(stderr, "unsupported media-key command\n");
      return 65;
    }

    if (!postKeyEvent(keyType, YES)) return 70;
    usleep(12000);
    if (!postKeyEvent(keyType, NO)) return 70;
    return 0;
  }
}
