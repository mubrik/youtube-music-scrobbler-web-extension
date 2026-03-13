export interface UserInfo { username: string; subscriber: string; session: string }

export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  duration: number;    // seconds
  currentTime: number; // seconds
}

export interface GetUserTrackResponse {
  track: {
    userplaycount: number;
    userloved: string;
  }
}