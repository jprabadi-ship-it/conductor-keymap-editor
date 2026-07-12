// Firmware/editor compatibility check. New RPCs and RuntimeState fields
// get added to this editor over time (e.g. setActiveUsbSlot,
// peripheral_r_connected); a device running older firmware simply doesn't
// have them, and the RPC layer's failure mode for an unrecognized request
// is a slow, unhelpful timeout rather than a clear error. This lets callers
// warn proactively right after connecting instead.
//
// Bump MIN_SUPPORTED_FW_VERSION whenever a change here depends on a new
// firmware capability, and keep it in sync with the firmware side's
// CONFIG_ZMK_STUDIO_FIRMWARE_VERSION bump (see conductor-dongle's
// monokey_R.conf / monokey_dongle.conf).
export const MIN_SUPPORTED_FW_VERSION = '0.6.12';

// Firmware reports "X.Y.Z (YYYY-MM-DD HH:MM)" (see
// encode_device_info_firmware_version in core_subsystem.c) -- pull out
// just the leading semver-ish part.
export function parseFirmwareVersion(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Returns true/false when the version could be parsed, or null when it
// couldn't be determined at all (e.g. empty string) -- callers should
// treat null as "unknown", not as "unsupported".
export function isFirmwareVersionSupported(raw: string | undefined | null): boolean | null {
  const parsed = parseFirmwareVersion(raw);
  if (!parsed) return null;
  return compareVersions(parsed, MIN_SUPPORTED_FW_VERSION) >= 0;
}
