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
import type { FirmwareUnitInfo } from './usbService';

export const MIN_SUPPORTED_FW_VERSION = '0.6.12';

// Cross-unit firmware consistency (dongle vs L vs R). Only build ids are
// exactly comparable -- they carry the same CI-injected git SHA on every
// unit of one run. Compile-time stamps differ by minutes between parallel
// build jobs, so they are display-only here. A connected peripheral with an
// EMPTY id either runs pre-buildid firmware or a local build: report it as
// 'unknown' rather than 'mismatch' (we genuinely can't tell), but surface
// it so the user knows the comparison is incomplete.
export function analyzeFirmwareConsistency(
  self: FirmwareUnitInfo,
  peripherals: FirmwareUnitInfo[],
): { status: 'consistent' | 'mismatch' | 'unknown'; detail: string } {
  const connected = peripherals.filter(p => p.connected);
  const ids = [self, ...connected].map(u => u.buildId).filter(id => id !== '');
  const distinct = [...new Set(ids)];
  if (distinct.length > 1) {
    return {
      status: 'mismatch',
      detail: `ビルドIDが一致していません（${distinct.join(' / ')}）。全ユニットを同じzipのFWに焼き直してください`,
    };
  }
  if (ids.length < 1 + connected.length) {
    return {
      status: 'unknown',
      detail: 'ビルドIDを報告しないユニットがあるため比較できません（旧FWまたはローカルビルドの可能性）',
    };
  }
  return { status: 'consistent', detail: `全ユニットが同一ビルド（${distinct[0] ?? '不明'}）です` };
}

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

// Compares the connected device's firmware against the CI-published
// firmware-latest release (fetched via Electron's gh-CLI bridge; the repo
// is private so the web build never has this data and simply skips the
// check). Two signals, in priority order:
//  - release title carries "vX.Y.Z" -> newer semver than the device wins.
//  - same version: the device version string embeds its __DATE__/__TIME__
//    build stamp ("0.6.12 (2026-07-12 21:15)", UTC on CI runners), and the
//    release's publishedAt (also UTC) trails its own build by ~10min of
//    merge/publish steps. A 45min margin absorbs that gap without missing
//    genuinely newer builds, which in practice are hours apart.
export function checkFirmwareUpdate(
  deviceVersionRaw: string | undefined | null,
  releaseName: string,
  releasePublishedAt: string,
): { updateAvailable: boolean; latestVersion: string | null; reason: 'version' | 'build' | null } {
  const none = { updateAvailable: false, latestVersion: null, reason: null as null };
  const deviceVersion = parseFirmwareVersion(deviceVersionRaw);
  if (!deviceVersion) return none;

  const releaseVersion = releaseName.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;
  if (releaseVersion && compareVersions(releaseVersion, deviceVersion) > 0) {
    return { updateAvailable: true, latestVersion: releaseVersion, reason: 'version' };
  }

  const buildMatch = deviceVersionRaw?.match(/\((\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\)/);
  const publishedMs = Date.parse(releasePublishedAt);
  if (buildMatch && !Number.isNaN(publishedMs)) {
    const deviceBuildMs = Date.parse(`${buildMatch[1]}T${buildMatch[2]}:00Z`);
    const marginMs = 45 * 60 * 1000;
    if (!Number.isNaN(deviceBuildMs) && publishedMs > deviceBuildMs + marginMs) {
      return { updateAvailable: true, latestVersion: releaseVersion ?? deviceVersion, reason: 'build' };
    }
  }
  return none;
}
