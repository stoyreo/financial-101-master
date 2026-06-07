#!/bin/bash
# Double-click this file in Finder to start the Financial 101 Master dev server.
# It opens a Terminal window, runs `npm run dev`, and opens the app in your browser.

cd "$(dirname "$0")"

echo "Starting Financial 101 Master dev server..."
echo "Folder: $(pwd)"
echo ""

# Open the app in the default browser shortly after the server boots.
( sleep 5 && open "http://localhost:3000" ) &

npm run dev
