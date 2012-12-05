#!/opt/local/bin/perl
use strict;
use Data::Dumper;
use Math::Round qw/round/;
use JSON;

my $jsonHash = {};


open(MALE, "< @ARGV[0]") || die("failed to open @ARGV[0]");
open(FEMALE, "< @ARGV[1]") || die("failed to open @ARGV[1]");

my $male = {};
my $female = {};

my $index = 0;
while (<MALE>) {
  chomp($_);
  my ($name) = split(/\s+/,lc($_));
  $male->{ $name } = $index;
  $index++;
}
close(MALE);

$index = 0;
while (<FEMALE>) {
  chomp($_);
  my ($name) = split(/\s+/,lc($_));
  $female->{ $name } = $index;
  $index++;
}
close(FEMALE);

for my $name (keys %$male) {
  if( $female->{ $name } && $female->{ $name } < $male->{ $name } ) {
    #print "deleted $name from male ".$male->{ $name }."- the femaile rank is".$female->{ $name }."\n";
    delete $male->{ $name };
  }
}

for my $name (keys %$female) {
  if( $male->{ $name } && $male->{ $name } < $female->{ $name } ) {
    #print "deleted $name from female ".$female->{ $name }." - the mal rank is".$male->{ $name }."\n";
    delete $female->{ $name };
  }
}

my $json = new JSON;
#$json->pretty( 1 );
print "exports.firstNames = \n";
print $json->encode( { male =>$male , female => $female }).";\n";

