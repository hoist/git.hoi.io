#!/bin/bash
set -e

babel-node "#{dirname}/hook.js" | stdbuf -i0 -o0 -e0 sed "s/^/"$'\e[1G'"/";
exit ${PIPESTATUS[0]};
