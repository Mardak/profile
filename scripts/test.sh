#!/bin/bash
./genDFR.pl test.ifr > dfr.out
if ! diff dfr.out test.dfr 2>&1 > /dev/null; then
  echo "TEST FAILED - run diff dfr.out test.dfr"
  exit 1
fi
echo "TEST PASSED"
rm dfr.out
exit 0
