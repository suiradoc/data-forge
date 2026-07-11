#!/bin/bash
APP="/Applications/DataForge.app"

if [ ! -d "$APP" ]; then
  echo "DataForge.app was not found in /Applications."
  echo "Drag DataForge into the Applications folder first, then run this again."
  read -p "Press Enter to close this window..."
  exit 1
fi

xattr -cr "$APP"

echo "Done. DataForge is now trusted -- you can open it from Applications."
read -p "Press Enter to close this window..."
