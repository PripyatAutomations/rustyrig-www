# Room audio routing

Each room tab has an L/R/S/M selector; `/rxroute L|R|S|M` controls the current
room. L and R send RX to the respective ear, S sends mono RX to both ears, and
M mutes local output while preserving the subscription and decoder. New rooms
default to S. Settings are per server URL and room for this browser session.
Changing selected rooms, VFOs or application focus does not change established
streams' routing. Codec changes, PART and disconnect retain their normal
resource cleanup behavior. Only supported browser codecs can be decoded.

PARITY: native `rrclient/audio.c`, `rrclient/gtk/gtk.chat.c`, and
`doc/media-codecs.md` in rustyrig-fw.
