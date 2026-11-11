#!/usr/bin/env bash
set -euo pipefail

# Keep Ubuntu signature checks and fallbacks while avoiding the Canonical DNS dependency.
mirrors=/etc/apt/apt-mirrors.txt
if [[ -f "$mirrors" ]]; then
  sudo sed -i '/azure\.archive\.ubuntu\.com/d; /mirrors\.edge\.kernel\.org\/ubuntu/d' "$mirrors"
  printf '\nhttps://mirrors.edge.kernel.org/ubuntu/\tpriority:1\n' | sudo tee -a "$mirrors" >/dev/null
  grep -Fxq $'https://mirrors.edge.kernel.org/ubuntu/\tpriority:1' "$mirrors"
  cat "$mirrors"
else
  echo 'Runner has no APT mirror list; using its configured Ubuntu sources.'
fi
