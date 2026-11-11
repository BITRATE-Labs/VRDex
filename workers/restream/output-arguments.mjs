import { BROADCAST_ENCODING as E, resolveDestinationProfile } from './broadcast-profiles.mjs';
export function outputArguments(destination, target, profile = resolveDestinationProfile({destination})) {
    const expected = resolveDestinationProfile({settings: {videoPreset: profile.videoPreset, audioBitrateKbps: profile.audioBitrateKbps}, destination});
    if (Object.keys(expected).some(key => expected[key] !== profile[key])) throw Error('Invalid destination profile');
    return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-stats_period', '0.25', '-progress', 'pipe:3',
        '-fflags', '+discardcorrupt', '-probesize', '262144', '-analyzeduration', '1000000', '-f', E.programMux, '-i', 'pipe:0',
        '-map', '0:v:0', '-map', '0:a:0',
        ...(destination !== 'twitch' ? ['-c', 'copy'] : ['-c:v', E.videoCodec, '-threads', E.videoThreads, '-preset', profile.videoPreset === E.highRateVideoPreset ? E.highRatePreset : E.normalPreset, '-vf', `scale=${profile.width}:${profile.height},fps=${profile.frameRate}`, '-pix_fmt', E.pixelFormat, '-g', String(profile.frameRate * profile.keyframeIntervalSeconds), '-keyint_min', String(profile.frameRate * profile.keyframeIntervalSeconds), '-sc_threshold', E.sceneThreshold, '-bf', E.bFrames, '-b:v', `${profile.videoBitrateKbps}k`, '-minrate', `${profile.videoBitrateKbps}k`, '-maxrate', `${profile.videoBitrateKbps}k`, '-bufsize', `${profile.videoBitrateKbps * E.vbvMultiplier}k`, '-x264-params', E.x264Params, '-c:a', E.audioCodec, '-b:a', E.twitchAudioBitrateText, '-ar', E.audioSampleRateText, '-ac', E.audioChannelsText]),
        ...(target.tcUrl ? ['-rtmp_tcurl', target.tcUrl] : []), '-rw_timeout', '2000000', '-rtmp_playpath', target.key, '-f', E.outputMux, target.url];
}
