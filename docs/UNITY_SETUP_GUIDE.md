# Unity Setup Guide

This guide walks you through creating the Unity project, scenes, prefabs, UI, and Android build settings for the Block Plus mobile game.

## 1. Create The Unity Project

1. Open Unity Hub and create a new `2D (URP)` or `2D Core` project.
2. Copy the `Assets/Scripts` folder from this workspace into your Unity project's `Assets` folder.
3. Open the project and let Unity recompile the scripts.
4. Install TextMeshPro essentials if Unity asks.

Recommended Unity packages:

- `TextMeshPro`
- `Unity Ads` or `Advertisement Legacy` package, depending on the package available in your Unity version
- `URP` only if you want shader highlights and post-processing

## 2. Recommended Folder Layout In Unity

Create these folders in the Unity Editor:

```text
Assets/
  Art/
  Audio/
  Materials/
  Prefabs/
    Board/
    Pieces/
    UI/
    FX/
    Systems/
  Scenes/
  ScriptableObjects/
    Config/
    Ads/
    Pieces/
```

## 3. Create ScriptableObjects

### GameConfig

1. Right-click `Assets/ScriptableObjects/Config`
2. Select `Create > BlockPlus > Game > Game Config`
3. Name it `GameConfig`
4. Recommended values:
   - `Board Size`: `9`
   - `Tray Size`: `3`
   - `Score Per Block`: `10`
   - `Score Per Cleared Line`: `180`
   - `Line Clears Per Level`: `5`
   - `Max Combo`: `8`
   - `Combo Decay Seconds`: `5.5`
   - `Continue Clear Cell Count`: `9`
   - `Interstitial Every Games`: `3`

### AdsSettings

1. Right-click `Assets/ScriptableObjects/Ads`
2. Select `Create > BlockPlus > Ads > Ads Settings`
3. Name it `AdsSettings`
4. Leave `Test Mode` enabled until production
5. Enter your real game IDs and placement IDs after setting up Unity Ads

### Piece Shape Library

1. Use the top menu: `Tools > Block Plus > Generate Default Shape Library`
2. Unity creates:
   - `Assets/BlockPlusGenerated/PieceShapeLibrary.asset`
   - individual shape assets in `Assets/BlockPlusGenerated/Shapes`
3. Move them into your preferred `ScriptableObjects/Pieces` folder if you want

## 4. Build The Main Menu Scene

Create a scene named `MainMenu`.

### Hierarchy

```text
MainMenu
  EventSystem
  PersistentSystems
    AudioManager
    AdsManager
  MainMenuCanvas
    Background
    TitleGroup
    BestScorePanel
    ButtonGroup
      PlayButton
      SettingsButton
      ExitButton
    SettingsPanel
      SoundToggle
      MusicToggle
    FadeOverlay
```

### Canvas Setup

1. Add a `Canvas`
2. Set `UI Scale Mode` to `Scale With Screen Size`
3. Set reference resolution to `1080 x 1920`
4. Set match to `0.5`
5. Add `GraphicRaycaster`

### MainMenuController

1. Create an empty object named `MainMenu`
2. Add `MainMenuController`
3. Assign:
   - `Gameplay Scene Name`: `Gameplay`
   - `Best Score Text`
   - `Sound Toggle`
   - `Music Toggle`
   - `Settings Panel`
   - `Screen Fader`

### ScreenFader

1. Create a full-screen `Image` named `FadeOverlay`
2. Color it black
3. Add `CanvasGroup`
4. Add `ScreenFader`
5. Assign the `CanvasGroup`

### AudioManager

1. Create `PersistentSystems/AudioManager`
2. Add two `AudioSource` components:
   - Music source: loop enabled, play on awake disabled
   - SFX source: play on awake disabled
3. Add `AudioManager`
4. Assign the music and sound clips

### AdsManager

1. Create `PersistentSystems/AdsManager`
2. Add `AdsManager`
3. Assign `AdsSettings`
4. Keep this object in the menu so it survives into gameplay with `DontDestroyOnLoad`

## 5. Build The Gameplay Scene

Create a scene named `Gameplay`.

### Hierarchy

```text
Gameplay
  EventSystem
  GameplayRoot
    SafeArea
      Canvas
        Background
        ShakeRoot
          HUD
          BoardPanel
            BoardRoot
              CellContainer
          TrayPanel
            Slot0
            Slot1
            Slot2
          FeedbackLayer
          GameOverPanel
          FadeOverlay
        DragLayer
  Systems
    GameManager
    BoardManager
    PieceManager
    InputManager
    UIManager
    EffectPool
```

### Canvas Setup

1. Use `Scale With Screen Size`
2. Reference resolution: `1080 x 1920`
3. Put `DragLayer` on top so dragged pieces render above everything
4. Add a `Safe Area` helper if your template includes one, or anchor major panels away from device cutouts

### BoardRoot

1. Create a panel for the board
2. Inside it create `CellContainer`
3. Add `GridLayoutGroup` to `CellContainer`
4. Use:
   - `Constraint`: `Fixed Column Count`
   - `Constraint Count`: `9`
   - Cell size around `90 x 90` for 1080x1920 portrait
   - Spacing around `6 x 6`
5. Add `BoardManager` somewhere in `Systems`
6. Assign:
   - `Board Root`: the board panel `RectTransform`
   - `Grid Layout`: `CellContainer` grid layout
   - `Cell Parent`: `CellContainer`
   - `Cell Prefab`: prefab created below

### BoardCell Prefab

Create `Prefabs/Board/BoardCell.prefab`:

```text
BoardCell
  BackgroundImage
  FillImage
  GlowImage
  PreviewImage
```

Setup notes:

- Root should have `RectTransform`
- Add `BoardCellView`
- Assign:
  - `Background Image`
  - `Fill Image`
  - `Glow Image`
  - `Preview Image`
  - `Scale Root`: use the root `RectTransform`
- Use rounded sprites and subtle glow materials for a premium mobile look

### PieceView Prefab

Create `Prefabs/Pieces/PieceView.prefab`:

```text
PieceView
  CellContainer
    PieceCellPrefab instances are spawned at runtime
```

Setup notes:

1. Add `CanvasGroup`
2. Add `LayoutElement`
3. Add `PieceView`
4. Add `GridLayoutGroup` on `CellContainer`
5. Create a simple `Image` child or prefab sprite for `Cell Prefab`
6. Assign:
   - `Root`
   - `Cell Container`
   - `Grid Layout`
   - `Cell Prefab`
   - `Canvas Group`
   - `Layout Element`

### PieceManager

1. Add `PieceManager`
2. Assign:
   - `Shape Library`: generated piece library asset
   - `Piece View Prefab`
   - `Drag Layer`
   - `Tray Slots`: Slot0, Slot1, Slot2

### InputManager

1. Add `InputManager`
2. Assign:
   - `Gameplay Canvas`
   - `Gameplay Camera` if your canvas uses Screen Space Camera
   - `Board Manager`
   - `Game Manager`

### UIManager

Create the gameplay HUD:

- `ScoreText`
- `BestScoreText`
- `ComboText`
- `ComboFill`
- `LevelText`
- `GameOverPanel`
- `GameOverScoreText`
- `NewBestBadge`
- `ContinueButton`
- `RestartButton`
- `MenuButton`
- `FeedbackLayer`
- `FloatingScoreAnchor`
- `ComboPopupAnchor`
- `FadeOverlay`

Add `UIManager` and assign every field in the inspector.

### FloatingText Prefab

Create `Prefabs/UI/FloatingText.prefab`:

```text
FloatingText
  TMP_Text
```

Setup notes:

1. Add `CanvasGroup`
2. Add `FloatingText`
3. Assign:
   - `Root`
   - `Canvas Group`
   - `Label`

### GameManager

Add `GameManager` and assign:

- `Main Menu Scene Name`: `MainMenu`
- `Game Config`
- `Board Manager`
- `Piece Manager`
- `Input Manager`
- `UI Manager`
- `Effect Pool`
- `Screen Shake`
- `Audio Manager`
- `Ads Manager`

### ScreenShake

1. Add `ScreenShake` to a `ShakeRoot` object
2. Assign the large gameplay content container as the target
3. This shakes the board and HUD together for big combos

## 6. Effects Setup

The scripts expect pooled particle effects.

### Effect Prefabs

Create three particle prefabs:

- `PlaceEffect`
- `ClearEffect`
- `ComboBurstEffect`

Keep them lightweight:

- low particle count
- short lifetime
- no expensive collision
- no unnecessary trails

### EffectPool

1. Create `Systems/EffectPool`
2. Add `EffectPool`
3. Add a child `PoolRoot`
4. Create entries for:
   - `Place`
   - `Clear`
   - `ComboBurst`
5. Prewarm suggestion:
   - `Place`: `16`
   - `Clear`: `24`
   - `ComboBurst`: `4`

Each effect prefab needs `PooledEffect` with its `ParticleSystem` assigned.

## 7. Audio Setup

Recommended clips:

- calm looping background music
- soft block placement click
- stronger line clear burst
- special combo sting
- button tap sound

If you want separate sound and music buttons in gameplay too, reuse `AudioManager.Instance`.

## 8. Scene Wiring Checklist

Before pressing Play, confirm:

- `GameConfig` is assigned
- `AdsSettings` is assigned
- `PieceShapeLibrary` is assigned
- `BoardCell` prefab is assigned
- `PieceView` prefab is assigned
- `FloatingText` prefab is assigned
- tray slots are assigned in order
- all button references are assigned
- `AudioManager` and `AdsManager` exist once only

## 9. Android Build Setup

1. Open `File > Build Settings`
2. Switch platform to `Android`
3. Add both scenes:
   - `MainMenu`
   - `Gameplay`
4. Open `Project Settings > Player`
5. Set:
   - company name
   - product name
   - package name such as `com.yourstudio.blockplus`
   - version and bundle version code
6. Under `Other Settings`:
   - Scripting Backend: `IL2CPP`
   - Target Architectures: `ARM64` at minimum
   - Active Input Handling: `Input Manager` is enough for this project
7. Under `Resolution and Presentation`:
   - orientation: `Portrait`
8. Create or assign a keystore in `Publishing Settings`
9. For Google Play, prefer `Build App Bundle (Google Play)` for release uploads

## 10. How To Enable Unity Ads

1. Install the Unity Ads package supported by your Unity version
2. In current Unity documentation, the package is listed as `Advertisement Legacy` in Package Manager
3. If you want the exact direct Unity Ads flow used by the included `AdsManager`, install `com.unity.ads`
4. Unity currently recommends LevelPlay for best monetization performance, but direct Unity Ads integration still works and matches this project's architecture
5. In the Unity Dashboard, create your project/app entry
6. Copy the Android and iOS game IDs into `AdsSettings`
7. Copy your rewarded and interstitial placement IDs into `AdsSettings`
8. Leave `Test Mode` on during development
9. Make sure `AdsManager` exists in the first loaded scene
10. Test:
   - rewarded ad from game-over continue
   - interstitial every few completed runs
11. For production, disable `Test Mode`

If ads are temporarily disabled, `AdsManager` can still allow a fallback rewarded continue if `Allow Reward Fallback When Disabled` is enabled.

## 11. How To Build APK Or AAB

For local device testing:

1. Connect your Android phone with USB debugging enabled
2. In `Build Settings`, choose `Build And Run`
3. Test touch drag, pause/resume, audio toggle, game over, rewarded continue, and performance

For store upload:

1. Build an `.aab`
2. Upload it to the Google Play Console
3. Fill store listing, screenshots, privacy policy, content rating, and ads disclosure

## 12. How To Test On Mobile

Run these checks on a real device:

- portrait layout on a small phone
- portrait layout on a tall phone
- drag accuracy near screen edges
- combo popup timing
- pause and resume from app switcher
- airplane mode behavior if ads are unavailable
- best score persistence after relaunch
- stable frame rate during multiple line clears

## 13. Suggested Polish Pass Before Release

- add haptic feedback on placement and clears
- add a settings popup in gameplay
- tune particle counts on low-end devices
- add a privacy policy link before publishing with ads
- swap placeholder art and audio for your final assets
