using UnityEngine;

namespace BlockPlus.Data
{
    [CreateAssetMenu(menuName = "BlockPlus/Ads/Ads Settings", fileName = "AdsSettings")]
    public sealed class AdsSettings : ScriptableObject
    {
        public bool adsEnabled = true;
        public bool testMode = true;
        public bool allowRewardFallbackWhenDisabled = true;

        [Header("Unity Ads Game IDs")]
        public string androidGameId = "1234567";
        public string iosGameId = "1234568";

        [Header("Placements")]
        public string rewardedPlacementId = "Rewarded_Android";
        public string interstitialPlacementId = "Interstitial_Android";

        public string GetGameId()
        {
#if UNITY_IOS
            return iosGameId;
#else
            return androidGameId;
#endif
        }
    }
}
