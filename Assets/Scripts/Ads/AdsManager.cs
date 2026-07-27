using System;
using BlockPlus.Data;
using UnityEngine;
#if UNITY_ADS
using UnityEngine.Advertisements;
#endif

namespace BlockPlus.Ads
{
    public sealed class AdsManager : MonoBehaviour
#if UNITY_ADS
        , IUnityAdsInitializationListener, IUnityAdsLoadListener, IUnityAdsShowListener
#endif
    {
        [SerializeField] private AdsSettings settings;

        public static AdsManager Instance { get; private set; }

        private Action<bool> rewardedCallback;
        private bool rewardedLoaded;
        private bool interstitialLoaded;

        public bool RewardedAvailable =>
            settings != null && (!settings.adsEnabled || settings.allowRewardFallbackWhenDisabled || rewardedLoaded);

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void InitializeAds()
        {
            if (settings == null || !settings.adsEnabled)
            {
                return;
            }

            // The runtime script is wrapped so the project still compiles even if the Ads package is not installed yet.
#if UNITY_ADS
            Advertisement.Initialize(settings.GetGameId(), settings.testMode, this);
#else
            Debug.LogWarning("Unity Ads package is not installed. AdsManager is running in fallback mode.");
#endif
        }

        public void ShowRewarded(Action<bool> onCompleted)
        {
            rewardedCallback = onCompleted;

            if (settings == null || !settings.adsEnabled)
            {
                rewardedCallback?.Invoke(settings != null && settings.allowRewardFallbackWhenDisabled);
                rewardedCallback = null;
                return;
            }

#if UNITY_ADS
            if (rewardedLoaded)
            {
                Advertisement.Show(settings.rewardedPlacementId, this);
            }
            else
            {
                rewardedCallback?.Invoke(settings.allowRewardFallbackWhenDisabled);
                rewardedCallback = null;
            }
#else
            rewardedCallback?.Invoke(settings.allowRewardFallbackWhenDisabled);
            rewardedCallback = null;
#endif
        }

        public void ShowInterstitialIfReady()
        {
            if (settings == null || !settings.adsEnabled)
            {
                return;
            }

#if UNITY_ADS
            if (interstitialLoaded)
            {
                Advertisement.Show(settings.interstitialPlacementId, this);
            }
#endif
        }

#if UNITY_ADS
        public void OnInitializationComplete()
        {
            Advertisement.Load(settings.rewardedPlacementId, this);
            Advertisement.Load(settings.interstitialPlacementId, this);
        }

        public void OnInitializationFailed(UnityAdsInitializationError error, string message)
        {
            Debug.LogWarning($"Ads initialization failed: {error} - {message}");
        }

        public void OnUnityAdsAdLoaded(string placementId)
        {
            if (placementId == settings.rewardedPlacementId)
            {
                rewardedLoaded = true;
            }
            else if (placementId == settings.interstitialPlacementId)
            {
                interstitialLoaded = true;
            }
        }

        public void OnUnityAdsFailedToLoad(string placementId, UnityAdsLoadError error, string message)
        {
            Debug.LogWarning($"Ads load failed: {placementId} - {error} - {message}");
        }

        public void OnUnityAdsShowFailure(string placementId, UnityAdsShowError error, string message)
        {
            Debug.LogWarning($"Ads show failed: {placementId} - {error} - {message}");
            FinishRewarded(false);
        }

        public void OnUnityAdsShowStart(string placementId)
        {
        }

        public void OnUnityAdsShowClick(string placementId)
        {
        }

        public void OnUnityAdsShowComplete(string placementId, UnityAdsShowCompletionState showCompletionState)
        {
            if (placementId == settings.rewardedPlacementId)
            {
                rewardedLoaded = false;
                FinishRewarded(showCompletionState == UnityAdsShowCompletionState.COMPLETED);
                Advertisement.Load(settings.rewardedPlacementId, this);
            }
            else if (placementId == settings.interstitialPlacementId)
            {
                interstitialLoaded = false;
                Advertisement.Load(settings.interstitialPlacementId, this);
            }
        }

        private void FinishRewarded(bool success)
        {
            rewardedCallback?.Invoke(success);
            rewardedCallback = null;
        }
#endif
    }
}
