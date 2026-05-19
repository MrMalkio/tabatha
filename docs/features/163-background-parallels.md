# Feature #163 — Background Tracks / Parallels

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #1 Time tracking, #147 URL Mapping, #117 Desktop Companion  
> **Created:** 2026-05-14 · **Updated:** 2026-05-17

## User Context (Quotes)

> "Background tasks / Parallels — Podcasts, Music, shows etc. And we want to be able to intake from APIs or and also pulling based on urls and chrome media activity history. These are the tracking of passive things manually or automatically. Youtube, Spotify, from mobile, phone, or desktop."
> — User, 2026-05-14

> "We also want to track when user has Background elements that they may have active as well, Such as music, a podcast, TV Show, Body doubling call etc. These examples are likely background tracks but some others can be main focus as well such as a YouTube video tutorial."
>
> "Background Tracks can be more than one in parallel and they can be promoted to being the main focus."
>
> "User would be able to assign certain tabs or desktop apps as Background tracks. And certain sites will default to such. Example YouTube Music, Spotify, will default to background tracks so no InPop is needed. But a page like youtube.com or netflix may require confirmation of if it is focus or background."
>
> "The idea around these capability is increasing our context corpus. And of course allow full understanding of app components of activity, focus, progress or lack thereof. In the Flux Ecosystem every variable tracked will be."
> — User, 2026-05-17

## What It Does

Track **background activities** ("Background Tracks") — things running alongside the user's primary focus: music, podcasts, body-doubling calls, TV shows, video tutorials. Multiple background tracks can be active simultaneously. They run on a separate timeline that overlaps with focuses, and any track can be **promoted to main focus** at any time.

## Key Behaviors

| Behavior | Detail |
|----------|--------|
| **Multiple parallel tracks** | User can have 2+ background tracks active at once (e.g., Spotify + body doubling call) |
| **Focus promotion** | Any background track can be promoted to become the main focus (e.g., tutorial video → primary activity) |
| **Auto-classification** | Sites like YouTube Music, Spotify auto-classify as background → no InPop needed |
| **Ambiguous site confirmation** | Sites like youtube.com, netflix.com prompt: "Is this focus or background?" |
| **Tab/app assignment** | User can manually mark any tab or desktop app as a background track |
| **InPop suppression** | Auto-classified background tracks skip InPop entirely |
| **Context corpus expansion** | All tracked background activity feeds into the holistic activity picture |

## Auto-Classification Rules

| Site/App | Default Classification | InPop? |
|----------|----------------------|--------|
| YouTube Music | Background | No |
| Spotify (web/desktop) | Background | No |
| Apple Music | Background | No |
| SoundCloud | Background | No |
| YouTube.com | **Prompt** — "Focus or Background?" | Conditional |
| Netflix, Disney+, etc. | **Prompt** — "Focus or Background?" | Conditional |
| Discord (voice channel) | Background (body doubling) | No |
| Zoom/Google Meet | **Prompt** — "Focus or Background?" | Conditional |
| Podcast apps | Background | No |

## Detection Methods

| Source | Method | Examples |
|--------|--------|---------|
| Chrome tabs | `chrome.tabs` + URL mapping for media URLs | YouTube, Twitch, SoundCloud |
| Chrome media | Media session API / `navigator.mediaSession` | Any tab playing audio/video |
| Spotify | Spotify Web API (OAuth) | Currently playing track/podcast |
| Mobile | Tabatha Mobile companion | Phone media activity |
| Desktop Companion | Window monitor (#117) | Spotify desktop, VLC, etc. |
| Manual entry | User assigns tab/app as background track | Any tab or app |

## Data Model

```json
{
  "id": "track_abc",
  "type": "music" | "podcast" | "video" | "show" | "call" | "other",
  "classification": "background" | "focus" | "pending_confirmation",
  "source": "spotify" | "youtube" | "chrome_media" | "desktop_app" | "manual",
  "title": "Deep Focus Playlist",
  "artist": "Various",
  "startedAt": "2026-05-17T10:00:00Z",
  "endedAt": null,
  "concurrentFocus": "focus_xyz",
  "concurrentTracks": ["track_def", "track_ghi"],
  "promotedToFocusAt": null,
  "url": "https://open.spotify.com/playlist/...",
  "appName": null
}
```

## Focus Promotion Flow

```
Background Track (Spotify playing)
  → User clicks "Promote to Focus" on track card
  → Current focus is paused or completed (user chooses)
  → Track becomes the active focus entry
  → Time attribution shifts from background to primary
  → Other background tracks continue running
```

## Implementation Notes

- Background tracks tracked on separate timeline from focuses — they overlap, not replace
- Chrome `mediaSession` API for detecting audio/video playback in tabs
- Spotify integration via Web API polling (requires OAuth)
- URL rule engine: auto-classify based on URL patterns in settings
- Tab-level: right-click menu or InBar option → "Mark as Background Track"
- Desktop apps: Companion bridge reports app name → auto-classify or manual
- Timeline visualization: show tracks as thin colored bars below the main focus bar
- Privacy: media tracking is opt-in per source

## Open Questions

- Should background tracks affect focus scoring? (music = neutral, YouTube video = contextual)
- How to handle when a "background" video gets the user's full attention (auto-detect via tab focus time)?
- Should promoted tracks inherit the background track's start time or start fresh?
- Rate limit for API polling (Spotify has 30-second minimum)?
- Body doubling calls: should they affect idle detection? (user is "present" but may not be actively browsing)
