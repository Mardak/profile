#!/opt/local/bin/perl
use strict;
use Data::Dumper;
use Math::Round qw/round/;
use JSON;

my $jsonHash = {};

while (<STDIN>) {
  chomp($_);
  my ($site, @cats ) = split(/\s+/,$_);
  $jsonHash->{ $site } = \@cats;
}
close(FILE);


my $json = new JSON;
#$json->pretty( 1 );
print "exports.sitesOdpCats = \n";
print $json->encode( $jsonHash ).";\n";


