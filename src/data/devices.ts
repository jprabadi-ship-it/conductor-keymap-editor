import { LedColor } from '../types';

// Conductor slot index (see conductor_usb_slot.h on the firmware side):
// 0..4 = USB virtual slot 0..4 (software-selected via &usb_sel, since USB has
// only one physical connection), 5..9 = BT profile 0..4.
export const USB_SLOT_COUNT = 5;
export const USB_ENDPOINT_INDEX = (usbSlot: number) => usbSlot;
export const BT_ENDPOINT_INDEX = (btProfile: number) => USB_SLOT_COUNT + btProfile;

// Shared/default gesture bindings live on this fixed keymap layer (DT
// `layer-id = <13>;`). Per-device overrides are a separate value, not a
// layer position (see conductor_gesture.c / get/set_gesture_config RPC).
export const SHARED_GESTURE_LAYER = 13;

export type Direction = 'up' | 'down' | 'left' | 'right';
// Must match the DT `positions = <7 27 16 18>;` order on trackball_gestures
// (monokey_R.overlay / monokey_dongle.overlay): up=7=R02, down=27=R22,
// left=16=R11, right=18=R13.
export const GESTURE_POSITIONS: Record<Direction, string> = { up: 'R02', down: 'R22', left: 'R11', right: 'R13' };
// Matches the firmware's internal gesture_direction enum and the wire
// SetGestureBindingRequest.direction encoding: 0=up, 1=down, 2=left, 3=right.
export const DIRECTION_INDEX: Record<Direction, number> = { up: 0, down: 1, left: 2, right: 3 };
export const DIRECTION_LABELS: Record<Direction, { icon: string; label: string }> = {
  up: { icon: '↑', label: '上' }, down: { icon: '↓', label: '下' },
  left: { icon: '←', label: '左' }, right: { icon: '→', label: '右' },
};

export const overrideSlot = (endpointIndex: number, direction: Direction) => endpointIndex * 4 + DIRECTION_INDEX[direction];

export interface DeviceEntry {
  endpointIndex: number;
  label: string;
  ledColor?: LedColor;
  btIndex?: number; // present for BT rows only (renameable)
  usbSlot?: number; // present for USB rows only (renameable)
  status?: string;
}

export function buildDeviceEntries(
  bluetoothProfiles: { index: number; name: string; ledColor: LedColor; connected: boolean; active: boolean }[],
  usbActiveIndex: number,
): DeviceEntry[] {
  return [
    ...Array.from({ length: USB_SLOT_COUNT }, (_, i) => ({
      endpointIndex: USB_ENDPOINT_INDEX(i),
      label: `USB ${i}`,
      usbSlot: i,
      status: i === usbActiveIndex ? '使用中' : undefined,
    })),
    ...bluetoothProfiles.map(p => ({
      endpointIndex: BT_ENDPOINT_INDEX(p.index),
      label: `BT ${p.index}`,
      ledColor: p.ledColor,
      btIndex: p.index,
      status: p.active ? '使用中' : p.connected ? '接続済' : '未接続',
    })),
  ];
}
