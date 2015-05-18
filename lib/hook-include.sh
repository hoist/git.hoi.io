#!/bin/bash

node "#{dirname}/hook.js" | stdbuf -i0 -o0 -e0 sed "s/^/"$'\e[1G'"/";
