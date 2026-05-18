# Feature #163 — Background Tasks / Parallels (Passive Media Tracking)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #1 Time tracking, #147 URL Mapping, #117 Desktop Companion  
> **Created:** 2026-05-14

## User Context (Quotes)

> "Background tasks / Parallels — Podcasts, Music, shows etc. And we want to be able to intake from APIs or and also pulling based on urls and chrome media activity history. These are the tracking of passive things manually or automatically. Youtube, Spotify, from mobile, phone, or desktop."
> — User, 2026-05-14

## What It Does

Track **passive/background activities** — things the user is consuming alongside their primary work: music, podcasts, YouTube videos, shows. Detect these automatically via Chrome media APIs, URL patterns, and external service APIs (Spotify, YouTube). These are "parallels" — they run alongside active focuses, not instead of them.

## Detection Methods

| Source | Method | Examples |
|--------|--------|---------|
| Chrome tabs | `chrome.tabs` + URL mapping for media URLs | YouTube, Twitch, SoundCloud |
| Chrome media | Media session API / `navigator.mediaSession` | Any tab playing audio/video |
| Spotify | Spotify Web API (OAuth) | Currently playing track/podcast |
| Mobile | Tabatha Mobile companion (#10029) | Phone media activity |
| Desktop Companion | Window monitor (#117) | Spotify desktop, VLC, etc. |
| Manual entry | User logs what they're listening to | Vinyl, radio, in-person |

## Data Model

```json
{
  "id": "parallel_abc",
  "type": "music" | "podcast" | "video" | "show" | "other",
  "source": "spotify" | "youtube" | "chrome_media" | "manual",
  "title": "Deep Focus Playlist",
  "artist": "Various",
  "startedAt": "2026-05-14T10:00:00Z",
  "endedAt": "2026-05-14T11:30:00Z",
  "concurrentFocus": "focus_xyz",
  "url": "https://open.spotify.com/playlist/..."
}
```

## Implementation Notes

- Parallels are tracked on a separate timeline from focuses — they overlap, not replace
- Chrome `mediaSession` API for detecting audio/video playback in tabs
- Spotify integration via Web API polling (requires OAuth)
- Timeline visualization: show parallels as a thin bar below the main focus bar
- Privacy: media tracking is opt-in per source

## Open Questions

- Should parallels affect focus scoring? (e.g., music = OK, YouTube video = distraction?)
- How to handle ambient/background music vs. actively watching a video?
- Rate limit for API polling (Spotify has 30-second minimum)?
