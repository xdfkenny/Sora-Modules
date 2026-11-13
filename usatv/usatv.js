// USA TV Module for Sora - rebuilt 2026-11-12
// Original upstream (JayGxnzalez/Modules USA-TV) relied on a baby-beamup.club
// instance (NXDOMAIN) plus tvpass.org / moveonjoy.com / a1xs.vip, all dead.
// Channels rebuilt from verified-live free HLS sources (each URL probed
// HTTP 200 + real m3u8 playlist + playable segment on 2026-11-12).
// Logos from iptv-org (verified 200 without Referer).

var CHANNELS = [
  {id:"ustv-abc",name:"ABC",genre:"Live",logo:"https://i.imgur.com/pvXZ8DX.png",poster:"https://i.imgur.com/pvXZ8DX.png",streams:[{url:"https://amg01942-amg01942c6-stirr-us-10178.playouts.now.amagi.tv/playlist.m3u8",q:"1080P",d:"AMG"},{url:"https://aegis-cloudfront-1.tubi.video/69c4e4f9-84fa-43eb-b38e-6d1f9464ca73/playlist.m3u8",q:"720P",d:"TB"},{url:"https://aegis-cloudfront-1.tubi.video/1a352414-3a30-4f42-b14b-c091d02a5e45/playlist.m3u8",q:"720P",d:"TB"}]},
  {id:"ustv-fox",name:"Fox",genre:"Live",logo:"https://static.wikia.nocookie.net/tvstations/images/8/8e/KBSIO6.png",poster:"https://static.wikia.nocookie.net/tvstations/images/8/8e/KBSIO6.png",streams:[{url:"https://live.field59.com/kbsi/kbsi1/playlist.m3u8",q:"720P",d:"F59"}]},
  {id:"ustv-nbc",name:"NBC",genre:"Live",logo:"https://i.imgur.com/nxY84W5.png",poster:"https://i.imgur.com/nxY84W5.png",streams:[{url:"https://d368vp0qqzvkid.cloudfront.net/11603/88889711/hls/master.m3u8?ads.xumo_channelId=88889711a&ads.xumo_ifaType=&ads.xumo_providerId=3822&ads.xumo_providerName=NBCNBA",q:"1080P",d:"XM"},{url:"https://content.uplynk.com/channel/e72660594b7a4182982af1690609683d.m3u8",q:"1080P",d:"ST"},{url:"https://aegis-cloudfront-1.tubi.video/8e6af50d-76df-4208-ab8d-3ff8f512cd38/playlist.m3u8",q:"720P",d:"TB"}]},
  {id:"ustv-pbs",name:"PBS",genre:"Live",logo:"https://i.imgur.com/8c8isLj.png",poster:"https://i.imgur.com/8c8isLj.png",streams:[{url:"https://kqeddt2.lls.pbs.org/kqeddt2-hls.m3u8",q:"1080P",d:"PBS"}]},
  {id:"ustv-bloomberg",name:"Bloomberg",genre:"Live",logo:"https://jiotvimages.cdn.jio.com/dare_images/images/Bloomberg_Originals.png",poster:"https://jiotvimages.cdn.jio.com/dare_images/images/Bloomberg_Originals.png",streams:[{url:"https://86fdc85a.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfQmxvb21iZXJnT3JpZ2luYWxzX0hMUw/playlist.m3u8",q:"1080P",d:"WURL"},{url:"http://23.237.104.106:8080/USA_BLOOMBERG/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-cnn",name:"CNN",genre:"Live",logo:"https://jiotvimages.cdn.jio.com/dare_images/images/CNN.png",poster:"https://jiotvimages.cdn.jio.com/dare_images/images/CNN.png",streams:[{url:"https://tvsen6.aynaott.com/cnn/index.m3u8",q:"720P",d:"AO"},{url:"https://amg00803-cnnfast-amg00803c3-lg-es-5477.playouts.now.amagi.tv/playlist.m3u8",q:"1080P",d:"AMG"}]},
  {id:"ustv-fox-business",name:"Fox Business",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Fox_Business.svg/960px-Fox_Business.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Fox_Business.svg/960px-Fox_Business.svg.png",streams:[{url:"https://tvsen6.aynaott.com/foxbusiness/index.m3u8",q:"576P",d:"AO"}]},
  {id:"ustv-fox-news",name:"Fox News",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Fox_News_Channel_logo.svg/960px-Fox_News_Channel_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Fox_News_Channel_logo.svg/960px-Fox_News_Channel_logo.svg.png",streams:[{url:"https://tvsen6.aynaott.com/foxnews/index.m3u8",q:"1080P",d:"AO"},{url:"https://radiovid.foxnews.com/hls/live/661547/RADIOVID/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-newsmax",name:"Newsmax",genre:"Live",logo:"https://i.imgur.com/iE1izWq.png",poster:"https://i.imgur.com/iE1izWq.png",streams:[{url:"https://amg00217-newsmax-newsmax-zeasn-022k9.amagi.tv/playlist.m3u8",q:"1080P",d:"AMG"},{url:"https://2-fss-2.streamhoster.com/pl_120/206858-4404556-1/playlist.m3u8",q:"484P",d:"ST"},{url:"https://n1ottesorkatv.akamaized.net/hls/live/2113795/Live_1/index.m3u8",q:"1080P",d:"AK"}]},
  {id:"ustv-weather-channel",name:"Weather Channel",genre:"Live",logo:"https://i.imgur.com/PIaNjfa.png",poster:"https://i.imgur.com/PIaNjfa.png",streams:[{url:"https://twcprod-live.twc-tv.com/v1/manifest/b4d4d63a49309cc5140171fb2e92485c31be1e9e/DSP_6228e4760505741a116f1ba2_twcprod-live/6bf09ce5-366b-463c-b67e-c4b799f73c3f/4.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-big-ten-network",name:"Big Ten Network",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/en/thumb/3/39/Big_Ten_Network_Logo.svg/960px-Big_Ten_Network_Logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/en/thumb/3/39/Big_Ten_Network_Logo.svg/960px-Big_Ten_Network_Logo.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_BTN/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-espn-2",name:"ESPN 2",genre:"Live",logo:"https://i.imgur.com/00tsvjE.png",poster:"https://i.imgur.com/00tsvjE.png",streams:[{url:"http://85.237.89.160:9590/usa-s/ESPN-2-HD/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-espnu",name:"ESPNU",genre:"Live",logo:"https://i.imgur.com/HiBrysh.png",poster:"https://i.imgur.com/HiBrysh.png",streams:[{url:"http://85.237.89.160:9590/usa-s/ESPN-U-HD/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-fs1",name:"FS1",genre:"Live",logo:"https://i.imgur.com/O9BapV9.png",poster:"https://i.imgur.com/O9BapV9.png",streams:[{url:"http://85.237.89.160:9590/usa-s/FOX-SPORTS-1/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-golf-channel",name:"Golf Channel",genre:"Live",logo:"https://i.imgur.com/Lgux6Ik.png",poster:"https://i.imgur.com/Lgux6Ik.png",streams:[{url:"https://tvsen6.aynaott.com/golfchannel/index.m3u8",q:"576P",d:"AO"}]},
  {id:"ustv-nba-tv",name:"NBA TV",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/NBA_TV.svg/960px-NBA_TV.svg.png",poster:"https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/NBA_TV.svg/960px-NBA_TV.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_NBA/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-nhl-network",name:"NHL Network",genre:"Live",logo:"https://i.imgur.com/UNZ8bef.png",poster:"https://i.imgur.com/UNZ8bef.png",streams:[{url:"https://nhl-firetv.amagi.tv/playlist.m3u8",q:"1080P",d:"AMG"}]},
  {id:"ustv-sec-network",name:"SEC Network",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/SEC_Network_logo.svg/960px-SEC_Network_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/SEC_Network_logo.svg/960px-SEC_Network_logo.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_SEC_NETWORK/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-tennis-channel",name:"Tennis Channel",genre:"Live",logo:"https://image-resizer-cloud-cdn.api.cms.amdvids.com/image/7382296F-97F6-4450-B77B-8FE331FC04F6/3-1x1.png",poster:"https://image-resizer-cloud-cdn.api.cms.amdvids.com/image/7382296F-97F6-4450-B77B-8FE331FC04F6/3-1x1.png",streams:[{url:"https://mumbai-edge.smartplaytv.in/Tennis2/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-yes-network",name:"YES Network",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/YES_Network_logo.svg/960px-YES_Network_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/YES_Network_logo.svg/960px-YES_Network_logo.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_YES_NETWORK/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-bravo",name:"Bravo",genre:"Live",logo:"https://i.imgur.com/JmTIRLF.png",poster:"https://i.imgur.com/JmTIRLF.png",streams:[{url:"http://41.205.93.154/BRAVO/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-cinemax",name:"Cinemax",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Cinemax_2016.svg/960px-Cinemax_2016.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Cinemax_2016.svg/960px-Cinemax_2016.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_CINEMAX_WEST/index.m3u8",q:"720P",d:"ST"},{url:"http://23.237.104.106:8080/USA_5STARMAX/index.m3u8",q:"1080P",d:"ST"},{url:"http://23.237.104.106:8080/USA_MOREMAX/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-cmt",name:"CMT",genre:"Live",logo:"https://i.imgur.com/S7DOpdY.png",poster:"https://i.imgur.com/S7DOpdY.png",streams:[{url:"http://23.237.104.106:8080/USA_CMT/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-e",name:"E!",genre:"Live",logo:"https://i.imgur.com/TWFDkap.png",poster:"https://i.imgur.com/TWFDkap.png",streams:[{url:"http://23.237.104.106:8080/USA_E/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-hallmark-mystery",name:"Hallmark Mystery",genre:"Live",logo:"https://provider-static.plex.tv/epg/cms/production/29af70d1-d3ba-4a16-bc4d-bd99e7e7def4/hallmark-movies-and-more_color.png",poster:"https://provider-static.plex.tv/epg/cms/production/29af70d1-d3ba-4a16-bc4d-bd99e7e7def4/hallmark-movies-and-more_color.png",streams:[{url:"https://dbrb49pjoymg4.cloudfront.net/v1/master/3fec3e5cac39a52b2132f9c66c83dae043dc17d4/prod_default_xumo-ams-aws/master.m3u8?ads.xumo_channelId=99991709",q:"1080P",d:"XM"},{url:"http://41.205.93.154/HALLMARK/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-ion",name:"Ion",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ion_logo.svg/960px-Ion_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Ion_logo.svg/960px-Ion_logo.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_ION/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-metv",name:"MeTV",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/MeTV_Toons.png/250px-MeTV_Toons.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/MeTV_Toons.png/250px-MeTV_Toons.png",streams:[{url:"https://sr-live-weigel1.akamaized.net/out/v1/0d1dbf29e64e47bc991796cc24fbeb97/index_2.m3u8",q:"HD",d:"AK"}]},
  {id:"ustv-paramount-network",name:"Paramount Network",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Paramount_Network.svg/960px-Paramount_Network.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Paramount_Network.svg/960px-Paramount_Network.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_PARAMOUNT_NETWORK/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-syfy",name:"SYFY",genre:"Live",logo:"https://i.imgur.com/4fMWhUE.png",poster:"https://i.imgur.com/4fMWhUE.png",streams:[{url:"http://23.237.104.106:8080/USA_SYFY/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-trutv",name:"TruTV",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/TruTV_2014.svg/960px-TruTV_2014.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/TruTV_2014.svg/960px-TruTV_2014.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_TRUTV/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-showtime",name:"Showtime",genre:"Live",logo:"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Showtime_Family_Zone.svg/960px-Showtime_Family_Zone.svg.png",poster:"https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Showtime_Family_Zone.svg/960px-Showtime_Family_Zone.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_SHOWTIME_FAMILY/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-starz",name:"Starz",genre:"Live",logo:"https://i.imgur.com/N7oSm4d.png",poster:"https://i.imgur.com/N7oSm4d.png",streams:[{url:"http://23.237.104.106:8080/USA_STARZ_WEST/index.m3u8",q:"720P",d:"ST"},{url:"http://23.237.104.106:8080/USA_STARZ_COMEDY/index.m3u8",q:"1080P",d:"ST"},{url:"http://23.237.104.106:8080/USA_STARZ_FAMILY/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-food-network",name:"Food Network",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Food_Network_New_Logo.png/960px-Food_Network_New_Logo.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Food_Network_New_Logo.png/960px-Food_Network_New_Logo.png",streams:[{url:"http://23.237.104.106:8080/USA_FOOD_NETWORK/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-disney-channel",name:"Disney Channel",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/2024_Disney_Channel_text_logo.svg/960px-2024_Disney_Channel_text_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/2024_Disney_Channel_text_logo.svg/960px-2024_Disney_Channel_text_logo.svg.png",streams:[{url:"http://4.30.180.36:8420/disneychannel/index.m3u8?token=test",q:"720P",d:"ST"}]},
  {id:"ustv-discovery-channel",name:"Discovery Channel",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Discovery_Turbo_2025.svg/1920px-Discovery_Turbo_2025.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Discovery_Turbo_2025.svg/1920px-Discovery_Turbo_2025.svg.png",streams:[{url:"http://41.205.93.154/ESPNNEWS/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-history",name:"History",genre:"Live",logo:"https://i.imgur.com/ulHoqlP.png",poster:"https://i.imgur.com/ulHoqlP.png",streams:[{url:"https://lds-timeline-rakuten.amagi.tv/playlist.m3u8",q:"1080P",d:"AMG"}]},
  {id:"ustv-animal-planet",name:"Animal Planet",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/2018_Animal_Planet_logo.svg/960px-2018_Animal_Planet_logo.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/2018_Animal_Planet_logo.svg/960px-2018_Animal_Planet_logo.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_ANIMAL_PLANET/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-mtv",name:"MTV",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/MTV_2021_%28brand_version%29.svg/960px-MTV_2021_%28brand_version%29.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/MTV_2021_%28brand_version%29.svg/960px-MTV_2021_%28brand_version%29.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_MTV/index.m3u8",q:"1080P",d:"ST"},{url:"http://23.237.104.106:8080/USA_MTV_LIVE/index.m3u8",q:"720P",d:"ST"}]},
  {id:"ustv-vh1",name:"VH1",genre:"Live",logo:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/VH1_logonew.svg/960px-VH1_logonew.svg.png",poster:"https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/VH1_logonew.svg/960px-VH1_logonew.svg.png",streams:[{url:"http://23.237.104.106:8080/USA_VH1/index.m3u8",q:"1080P",d:"ST"}]},
  {id:"ustv-telemundo",name:"Telemundo",genre:"Live",logo:"https://imgx.fubo.tv/station_logos/telemundo_c.png",poster:"https://imgx.fubo.tv/station_logos/telemundo_c.png",streams:[{url:"https://streamer1.nexgen.bz/TELEMUNDO/index.m3u8",q:"1080P",d:"ST"},{url:"https://nbculocallive.akamaized.net/hls/live/2037098/sandiego/stream1/master.m3u8",q:"1080P",d:"AK"},{url:"https://d368vp0qqzvkid.cloudfront.net/11603/88889705/hls/master.m3u8?ads.xumo_channelId=88889705a&ads.xumo_ifaType=&ads.xumo_providerId=3819&ads.xumo_providerName=NBCNPHI",q:"1080P",d:"XM"}]},
  {id:"ustv-univision",name:"Univision",genre:"Live",logo:"https://i.imgur.com/Sr3EoK5.png",poster:"https://i.imgur.com/Sr3EoK5.png",streams:[{url:"http://168.228.44.241:9997/play/a09d/index.m3u8",q:"720P",d:"ST"}]}
];

async function searchResults(query) {
  try {
    var q = String(query || "").toLowerCase().trim();
    var filtered;
    if (!q || q === "all") {
      filtered = CHANNELS;
    } else {
      filtered = CHANNELS.filter(function(ch) {
        return ch.name.toLowerCase().indexOf(q) !== -1 || ch.genre.toLowerCase().indexOf(q) !== -1;
      });
    }
    var results = filtered.map(function(ch) {
      return { title: ch.name, image: ch.logo, href: ch.id };
    });
    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractDetails(href) {
  try {
    var ch = CHANNELS.find(function(c) { return c.id === href; });
    if (!ch) return JSON.stringify([]);
    return JSON.stringify([{ title: ch.name, image: ch.poster || ch.logo, description: ch.genre, href: href }]);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractEpisodes(href) {
  try {
    var ch = CHANNELS.find(function(c) { return c.id === href; });
    if (!ch) return JSON.stringify([]);
    return JSON.stringify([{ number: 1, title: "Watch Live", href: href }]);
  } catch (e) {
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(href) {
  try {
    var ch = CHANNELS.find(function(c) { return c.id === href; });
    if (!ch || !ch.streams || ch.streams.length === 0) return JSON.stringify({ streams: [], subtitles: [] });
    var streams = ch.streams.map(function(s) {
      return { title: s.q + " [" + s.d + "]", streamUrl: s.url, headers: { "User-Agent": "Mozilla/5.0" } };
    });
    return JSON.stringify({ streams: streams, subtitles: [] });
  } catch (e) {
    return JSON.stringify({ streams: [], subtitles: [] });
  }
}
