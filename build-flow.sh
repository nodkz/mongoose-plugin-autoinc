#!/bin/bash
find ./src -name '*.js' -not -path '*/__*' | while read filepath; do cp $filepath `echo $filepath | sed 's/\\/src\\//\\/lib\\//g'`.flow; done