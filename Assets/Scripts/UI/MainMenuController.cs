using System.Collections;
using BlockPlus.Audio;
using BlockPlus.Infrastructure;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace BlockPlus.UI
{
    public sealed class MainMenuController : MonoBehaviour
    {
        [SerializeField] private string gameplaySceneName = "Gameplay";
        [SerializeField] private TMP_Text bestScoreText;
        [SerializeField] private Toggle soundToggle;
        [SerializeField] private Toggle musicToggle;
        [SerializeField] private GameObject settingsPanel;
        [SerializeField] private ScreenFader screenFader;

        private void Start()
        {
            if (screenFader != null)
            {
                StartCoroutine(screenFader.FadeInRoutine());
            }

            bestScoreText.text = SaveService.LoadBestScore().ToString("N0");
            soundToggle.isOn = AudioManager.Instance == null ? SaveService.LoadSoundEnabled() : AudioManager.Instance.SoundEnabled;
            musicToggle.isOn = AudioManager.Instance == null ? SaveService.LoadMusicEnabled() : AudioManager.Instance.MusicEnabled;
            settingsPanel.SetActive(false);
        }

        private void Update()
        {
            if (!Input.GetKeyDown(KeyCode.Escape))
            {
                return;
            }

            if (settingsPanel.activeSelf)
            {
                ToggleSettings();
            }
            else
            {
                ExitGame();
            }
        }

        public void Play()
        {
            if (AudioManager.Instance != null)
            {
                AudioManager.Instance.PlayButton();
            }

            StartCoroutine(PlayRoutine());
        }

        public void ToggleSettings()
        {
            if (AudioManager.Instance != null)
            {
                AudioManager.Instance.PlayButton();
            }

            settingsPanel.SetActive(!settingsPanel.activeSelf);
        }

        public void SetSound(bool enabled)
        {
            if (AudioManager.Instance != null)
            {
                AudioManager.Instance.SetSoundEnabled(enabled);
            }
            else
            {
                SaveService.SaveSoundEnabled(enabled);
            }
        }

        public void SetMusic(bool enabled)
        {
            if (AudioManager.Instance != null)
            {
                AudioManager.Instance.SetMusicEnabled(enabled);
            }
            else
            {
                SaveService.SaveMusicEnabled(enabled);
            }
        }

        public void ExitGame()
        {
            if (AudioManager.Instance != null)
            {
                AudioManager.Instance.PlayButton();
            }

            Application.Quit();
        }

        private IEnumerator PlayRoutine()
        {
            if (screenFader != null)
            {
                yield return screenFader.FadeOutRoutine();
            }

            SceneManager.LoadScene(gameplaySceneName);
        }
    }
}
