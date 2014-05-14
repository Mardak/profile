#!/usr/bin/perl
use strict;
use Data::Dumper;
use Digest::MD5 qw(md5 md5_hex md5_base64);
## make sure that JSON is installed, flag error otherwise
eval "use JSON;";
if ($@) {
  print "***********DEPENDECY MISSING*********\n".
        "Please install JSON perl module by running:\n".
        "sudo perl -MCPAN -e 'install JSON'\n";
  exit 1;
}

## The expected format is
## uuid interest choice isTop survey_rank

open(MAP, "< @ARGV[0]") || die("failed to open @ARGV[0]");

my $dfr = {};

while(<MAP>) {
  chomp($_);
  my ($domain,$cat)  = split(/\s+/,$_);
  if (!$dfr->{$domain}) {
    $dfr->{$domain}->{__ANY} = [];
  }
  push @{$dfr->{$domain}->{__ANY}}, $cat;
}

my $json = new JSON;
### print to stdout
$json->pretty( 1 );
print "var interestsData = ";
print $json->encode($dfr).";\n";
