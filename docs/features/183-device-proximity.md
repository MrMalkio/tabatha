# Feature #183 — Device Proximity Detection

> **Status:** 📋 Planned · **Version:** v0.4.0  
> **Depends On:** #117 Desktop Companion, Mobile, #182 Chaperone Mode  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Phone and computer should know when they are not near each other."
> — User, 2026-05-15

## What It Does

Detect whether the user's phone and computer are **physically near each other** using proximity signals. This enables intelligent behavior: suppress phone-based idle triggers when phone is in another room, adjust Chaperone (#182) behavior based on device proximity, and improve context accuracy.

## Detection Methods

| Method | Range | Accuracy | Battery Impact |
|--------|-------|----------|---------------|
| **Bluetooth RSSI** | ~10m | High | Low |
| **LAN/WiFi presence** | Same network | Medium (same building) | Negligible |
| **Ultrasonic ping** | ~5m | Very high | Medium |
| **BLE beacon** | ~30m configurable | High | Very low |

## Use Cases

| Scenario | Proximity | Tabatha Behavior |
|----------|-----------|-----------------|
| Phone on desk, user at computer | Near | Full cross-device sync, Chaperone responds from both |
| Phone in another room | Far | Don't count phone idle as user idle, suppress phone triggers |
| User leaves desk with phone | Phone moves away | Start desktop idle timer, note "user left desk" |
| User returns with phone | Phone approaches | Welcome back prompt, resume tracking |

## Implementation Notes

- Mobile app: broadcast BLE beacon with device ID
- Desktop Companion: scan for BLE beacon, report proximity state
- Proximity state: `{ near: boolean, distance: "close"|"room"|"far"|"unknown", lastSeen: ISO }`
- Fallback: if BLE unavailable, use LAN ping (less precise but functional)
- Privacy: proximity data stays local, never uploaded

## Open Questions

- Should proximity affect notification routing? (e.g., only show on nearest device)
- Calibration needed per environment? (office vs. home)
- Multiple devices — what if user has tablet too?
