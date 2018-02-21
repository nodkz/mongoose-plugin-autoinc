#!/bin/bash
find ./src -name '*.d.ts' -not -path '*/__*' | while read filepath; do cp $filepath `echo $filepath | sed 's/\\/src\\//\\/lib\\//g'`; done