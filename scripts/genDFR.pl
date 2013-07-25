#!/opt/local/bin/perl
use strict;
use Data::Dumper;
use JSON;


### open DFR file
open(DFR, "< @ARGV[0]") || die("failed to open @ARGV[0]");
my $jsonString = join("",<DFR>);
close(DFR);

my $json = new JSON;

my $ifrData = $json->decode($jsonString);

### populate hosts map
my $hosts = {};
while (my($cat,$hostList) = (each %$ifrData)) {
  for my $entry (@$hostList) {
    ### check for path
    my ($host, $path) = split(/:/,lc($entry));
    ### replace leading wwww
    $host =~ s/^www\.//;
    ### check for path
    if ($path && $path =~ /[a-z]/) {
      ### path is not empty or garbage
      ### so, clean off all non alpha numerics 
      $path =~ s/[^a-z0-9][^a-z0-9]*/ /g;
      ### remove leading and trailing spaces
      $path =~ s/^  *//;
      $path =~ s/  *$//;
    }
    else {
      ### no path give, assume __ANY
      $path = "__ANY";
    }
    $hosts->{$host} = {} if (!$hosts->{$host});
    $hosts->{$host}->{$path} = [] if(!$hosts->{$host}->{$path});
    ### make sure cat does not exist in the list
    if (!grep {$cat eq $_} @{$hosts->{$host}->{$path}}) {
      push @{$hosts->{$host}->{$path}}, $cat;
    }
  }
}

### print to stdout
$json->pretty( 1 );
print "var interestsData = ";
print $json->encode( $hosts ).";\n";
