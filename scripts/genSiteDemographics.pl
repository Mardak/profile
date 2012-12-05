#!/opt/local/bin/perl
# this scripts generates site demographis
# the inoput file is expected to be in these format
# domain age_18 age_25 age_35 age_45 age_55 age_65 no_college 
# some_college college graduate male female children no_children 
#
# the file will generate output in the same fromat with the site probabilities in 
# the correponding columns
# Formula for computing probabilites 
#
# P(M) =  ( 1 + D(M) / 52 ) * F(M) / ( ( 1 + D(M) / 52 ) * F(M) + ( 1 + D(F) / 100 ) * F(F) )
# Here: 
# P(M) - probability of a visitor being male
# D(M) - percentage of the site sepcific deviation from genral population frequency (expressed in %)
# F(M) - general population frequency 
#
# Addon computes a probability that a user is male as follows:
# Consider first 100 most frecent sites, they can be visited by males 
# and femail users with some probability.  Hence, these 100 sites "generate"
# 100^2 different strings of the form MMFFMFMF...FM , if the user is male
# it's corresponding 100 characters string is all M, if the user is female
# then it's all F.  The frequency of each sring 
# F(M) = product of each site male probabilites
# F(F) = product of each site female probabilites
# since the user can be eighter male or female then, the corresponding 
# probablity of male/female is 
# P(M) = F(M) / ( F(M) + F(F) ) & 
# P(F) = F(F) / ( F(M) + F(F) ) 
#
use strict;
use Data::Dumper;
use Math::Round qw/round/;
use JSON;

my $dataFile = $ARGV[0];
open(FILE , "<$dataFile" );
my $jsonHash = {};

while (<FILE>) {
  chomp($_);

  my ($site, $rank, @rest ) = split(/\s+/,$_);
  $jsonHash->{ $site }->{ "rank" } = $rank;
  $jsonHash->{ $site }->{ "dValues" } = \@rest;
  $jsonHash->{ $site }->{ "genProbs" } = [];
  $jsonHash->{ $site }->{ "equalProbs" } = [];
}
close(FILE);


my $json = new JSON;
#$json->pretty( 1 );
print "exports.sitesDemographics = \n";
print $json->encode( $jsonHash )."\n";


