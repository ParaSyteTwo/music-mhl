from enum import Enum


class YtdlpErrorType(Enum):
    YTDLP_AUTH = "ytdlp_auth"
    YTDLP_EXTRACTOR = "ytdlp_extractor"
    YTDLP_NETWORK = "ytdlp_network"
    YTDLP_UNKNOWN = "ytdlp_unknown"


ERROR_MESSAGES = {
    YtdlpErrorType.YTDLP_AUTH: "Authentication error with YouTube (cookies may be invalid or expired)",
    YtdlpErrorType.YTDLP_EXTRACTOR: "YouTube extractor error (yt-dlp needs update)",
    YtdlpErrorType.YTDLP_NETWORK: "Network error downloading from YouTube",
    YtdlpErrorType.YTDLP_UNKNOWN: "Unknown yt-dlp error",
}


def classify_ytdlp_error(err: Exception) -> YtdlpErrorType:
    err_str = str(err).lower()

    if any(kw in err_str for kw in ['login', 'auth', 'forbidden', '403', 'not available']):
        return YtdlpErrorType.YTDLP_AUTH
    if any(kw in err_str for kw in ['extractor', 'not supported']):
        return YtdlpErrorType.YTDLP_EXTRACTOR
    if any(kw in err_str for kw in ['connection', 'timeout', 'network', 'http error']):
        return YtdlpErrorType.YTDLP_NETWORK

    return YtdlpErrorType.YTDLP_UNKNOWN
