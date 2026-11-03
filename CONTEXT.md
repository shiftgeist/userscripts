# Userscripts

This repository contains browser userscripts. Each script uses a metadata header.

## Language

**Userscript**:
A browser script that extends a website for the user.
This collection includes site-specific userscripts, userscripts for multiple websites, and developer tools.
_Avoid_: Browser extension, plugin

**Script catalog**:
The list of userscripts in the Scripts section of `README.md`.
Each entry contains a name, a description, an installation URL, and a source link.
_Avoid_: Developer tree, script registry

**Userscript header**:
The metadata block at the start of a userscript.
`README.md` contains the template for this block.
_Avoid_: Script manifest

**Timestamp**:
The `@timestamp` value in a userscript header.
It uses `YYYYMMDD.HHMM` in local time. (`date '+%Y%m%d.%H%M'`)
The author updates it for every source edit.
_Avoid_: Version number, build number, setting @version

**Slim HTML snapshot**:
A reduced HTML representation of an element that the user selects.
The snapshot provides page context for an AI agent.
_Avoid_: Screenshot, full page source

**Price list**:
A collection of prices from a supported page that lists items.
The Price List userscript provides the mean, median, minimum, and maximum price.
_Avoid_: Price comparison, price history

**Flight window**:
A time interval within the date and time range that the user selects for Cologne Bonn Airport.
The analyzer identifies the busiest flight windows within the maximum duration that the user specifies.
_Avoid_: Flight duration, departure slot

**Blended token price**:
The combined input and output token price per million tokens.
The Blend Model Pricing userscript displays this value.
_Avoid_: Input token price, output token price

**Chat export**:
A JSON record of text and image URLs from the open WhatsApp Web chat.
The exporter collects chat content as the user scrolls.
_Avoid_: Full chat backup, image archive
