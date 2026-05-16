# Feature #180 — InPop Variants (Profile-Aware, Site-Specific)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** #123 Intent v2, #147 URL Mapping, #118 Settings, InPop  
> **Created:** 2026-05-15

## User Context (Quotes)

> "InPop can have variations for different sites and also different for professional profiles vs personal profiles. Such as on an InPop-Social — is customized to help users access social media and be significantly more intentional and mindful. The textbox is larger, and there is a timer option on the InPop. Along with assistance to help them get straight to the thing that they actually want to do, because it is very easy for a user to land on an FB page or Instagram page and completely forget what they were about to do."
>
> "When timer is up it doesn't block them right away it refocuses them and attempts to snap out of it, they can also change their path too. But it's never a simple snooze."
>
> "On the note of helping them get what they intended to do done on that app faster, it might be something like make a Facebook post. So the app will have them draft the post in the InPop and once ready it copies it to their clipboard and then points them right to the FB Post composer and pastes, then the user takes over."
> — User, 2026-05-15

## What It Does

**InPop becomes context-aware** — showing different variants based on the site category and user's profile (professional vs personal). The flagship variant is **InPop-Social**, purpose-built to combat social media attention hijacking.

## InPop Variants

| Variant | Triggers On | Special Features |
|---------|-------------|-----------------|
| **InPop-Standard** | Default for all sites | Current behavior |
| **InPop-Social** | Facebook, Instagram, Twitter/X, Reddit, TikTok, YouTube | Larger textbox, timer, guided actions, refocus prompts |
| **InPop-Work** | Asana, Jira, Notion, Slack, Teams | Quick-pick from active tasks/focuses |
| **InPop-Research** | Google Scholar, PubMed, Wikipedia, docs sites | "What are you researching?" with topic linking |
| **InPop-Shopping** | Amazon, eBay, shopping sites | Budget awareness, "Is this for a project?" |
| **InPop-AI** | ChatGPT, Claude, Gemini, Cursor | Auto-link agent context (#178) |

## InPop-Social — Deep Design

### Entry (Landing on Social Media)

```
┌─────────────────────────────────────────────────────────┐
│  🧠 Wait — what are you here to do?                     │
│                                                         │
│  It's easy to get lost on [Facebook]. Take a moment.    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │  I'm here to...                                 │    │
│  │                                                 │    │
│  │                                                 │    │
│  │  (larger textbox for detailed intent)           │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ⏱ Set a timer:  [5 min] [10 min] [15 min] [Custom]    │
│                                                         │
│  Quick Actions:                                         │
│  [📝 Make a post] [💬 Check messages] [📷 Upload photo] │
│  [🔍 Search for something] [👤 Check a profile]         │
│                                                         │
│  [ Let me in — I know what I'm doing ]                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Guided Action: "Make a Post"

1. User clicks "📝 Make a post"
2. InPop expands to a **draft composer**:
   ```
   ┌──────────────────────────────────────────┐
   │  ✏️ Draft your post here                  │
   │  ┌──────────────────────────────────────┐ │
   │  │                                      │ │
   │  │  (rich text area for composing)      │ │
   │  │                                      │ │
   │  └──────────────────────────────────────┘ │
   │  📎 Attach image  🔗 Add link             │
   │                                           │
   │  [ ✅ Ready — copy & go to composer ]     │
   └───────────────────────────────────────────┘
   ```
3. User drafts their post
4. Clicks "Ready" → copies to clipboard → navigates to FB's post composer → auto-pastes
5. User takes over from there

### Timer Expiry (Refocus, Not Block)

When the social media timer expires:

```
┌─────────────────────────────────────────────────────────┐
│  ⏰ Time check — you've been on [Instagram] for 10 min  │
│                                                         │
│  You came here to: "Check messages from Sarah"          │
│                                                         │
│  ✅ Did you finish what you came for?                    │
│  ❌ Got sidetracked — help me refocus                    │
│  🔄 I'm doing something different now: [________]       │
│  ⏱ I need a little more time: [5 min] [10 min]          │
│     (not a snooze — what will you accomplish?)           │
│     [__________________________________]                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** Timer expiry **never** just snoozes. Every extension requires the user to articulate what they'll do with the extra time.

### Profile Awareness

| Profile | InPop-Social Behavior |
|---------|----------------------|
| **Professional** | Stricter — default timer 5 min, stronger refocus language, logs to work hours |
| **Personal** | Gentler — default timer 15 min, softer language, logs to personal time |
| **Focus Mode active** | Most strict — "You're in focus mode. Are you sure?" with justification |
| **Freeform Mode** (#161) | Suppressed — no InPop-Social overlay |

## Implementation Notes

- InPop variant selection: background determines variant based on URL patterns (#147) + user profile
- Variant config stored in Settings → "InPop Variants" section
- Each variant is a React component that extends base InPop with additional features
- Timer: uses existing countdown infrastructure from focus timer
- Guided actions: site-specific action templates (FB post, IG upload, etc.)
- Clipboard API: `navigator.clipboard.writeText()` for paste-and-go flow
- URL navigation: `chrome.tabs.update()` to navigate to the specific composer URL

## Site-Specific Action Templates

| Site | Quick Actions |
|------|--------------|
| **Facebook** | Make a post, Check messages, Check notifications, Search, Visit a profile/page |
| **Instagram** | Upload photo, Check DMs, View stories, Search |
| **Twitter/X** | Post a tweet, Check DMs, Search |
| **Reddit** | Make a post, Search, Check inbox |
| **YouTube** | Search for a video, Upload, Check subscriptions |
| **TikTok** | Search, Post a video |

## Implementation Files

| File | Purpose |
|------|---------|
| `src/content/InPop.jsx` | Base InPop (extend with variant system) |
| TBD → `src/content/InPopSocial.jsx` | Social media variant |
| TBD → `src/content/InPopWork.jsx` | Work tools variant |
| TBD → `src/content/InPopVariantRouter.jsx` | Variant selection logic |
| `src/settings/index.jsx` | InPop variant settings |

## Open Questions

- Should InPop-Social remember the user's most common social media actions per site?
- Can guided actions be user-customizable? (e.g., "On LinkedIn, my quick actions are: Post, Check messages, Job search")
- Should the timer data feed into a "social media usage" report?
- How to handle social media in embedded frames (e.g., Facebook widget on another site)?
