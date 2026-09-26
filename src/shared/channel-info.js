export async function loadChannelInfo(channel, fetcher = fetch) {
  const path = channel.type === "live"
    ? `/service/v2/channels/${encodeURIComponent(channel.resourceId)}/live-detail`
    : `/service/v1/videos/${encodeURIComponent(channel.resourceId)}`;
  const response = await fetcher(`https://api.chzzk.naver.com${path}`, {
    credentials: "omit", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Channel info unavailable");
  const { content } = await response.json();
  if (!content) throw new Error("Channel info unavailable");
  return {
    name: typeof content.channel?.channelName === "string" ? content.channel.channelName.trim().slice(0, 100) : "",
    title: [content.liveTitle, content.videoTitle].find((value) => typeof value === "string" && value.trim())?.trim().slice(0, 500) || "방송 정보 없음",
  };
}

export function channelHeading(channel, index, info) {
  const name = channel.name || info?.name || channel.streamerName || "스트리머 확인 중";
  const title = info?.title || "방송 정보 확인 중";
  return `채널 ${index + 1} · ${name} · ${title}`;
}
