# usage-band

A live band above the prompt with three meters: the 5-hour rate-limit window, the weekly (7-day) window, and how full the current context window is. Each meter is a thick glowing bar that stretches to the width of the prompt, a percentage, and for the limits a countdown to reset. Figures come from the engine's own session measurements, pushed after every turn and whenever a limit moves a point, so nothing polls the API.

Colors: run `/usage-palette` (or press 🎨 on the band) to open a picker with live previews of six palettes — neon, ocean, sunset, aurora, candy, ember. `/usage-palette <name>` switches directly. The choice is saved across sessions.

The limit meters show `—` until the first response of a session, and stay empty when Claude is used with an API key rather than a Pro/Max subscription.

## Install

```
/plugin install usage-band --marketplace SpringHihihaha/usage-band
```

Answer `y` to add the marketplace, then pick a scope.
