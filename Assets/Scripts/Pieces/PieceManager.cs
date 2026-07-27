using BlockPlus.Data;
using BlockPlus.Input;
using UnityEngine;

namespace BlockPlus.Pieces
{
    public sealed class PieceManager : MonoBehaviour
    {
        [SerializeField] private PieceShapeLibrary shapeLibrary;
        [SerializeField] private PieceView pieceViewPrefab;
        [SerializeField] private RectTransform dragLayer;
        [SerializeField] private RectTransform[] traySlots;

        private GameConfig config;
        private InputManager inputManager;
        private RuntimePiece[] trayPieces;
        private PieceView[] pieceViews;

        public RuntimePiece[] TrayPieces => trayPieces;

        public void Initialize(GameConfig gameConfig, InputManager owner)
        {
            config = gameConfig;
            inputManager = owner;

            if (shapeLibrary == null || pieceViewPrefab == null || dragLayer == null || traySlots == null || traySlots.Length == 0)
            {
                Debug.LogError("PieceManager is missing one or more required references.");
                enabled = false;
                return;
            }

            trayPieces = new RuntimePiece[traySlots.Length];
            pieceViews = new PieceView[traySlots.Length];

            for (int index = 0; index < traySlots.Length; index++)
            {
                if (pieceViews[index] == null)
                {
                    PieceView instance = Instantiate(pieceViewPrefab, traySlots[index]);
                    instance.name = $"PieceView_{index}";
                    instance.Initialize(inputManager, traySlots[index], dragLayer);
                    pieceViews[index] = instance;
                }
            }
        }

        public void ResetTray()
        {
            for (int index = 0; index < trayPieces.Length; index++)
            {
                trayPieces[index] = null;
                pieceViews[index].Hide();
            }
        }

        public void FillEmptySlots()
        {
            for (int index = 0; index < trayPieces.Length; index++)
            {
                if (trayPieces[index] != null)
                {
                    continue;
                }

                RuntimePiece piece = CreateRandomPiece();
                if (piece == null)
                {
                    continue;
                }

                trayPieces[index] = piece;
                pieceViews[index].Bind(piece);
            }
        }

        public void RemovePiece(PieceView view)
        {
            for (int index = 0; index < pieceViews.Length; index++)
            {
                if (pieceViews[index] != view)
                {
                    continue;
                }

                trayPieces[index] = null;
                pieceViews[index].CompletePlacement();
                return;
            }
        }

        public bool TryGetPiece(PieceView view, out RuntimePiece piece)
        {
            for (int index = 0; index < pieceViews.Length; index++)
            {
                if (pieceViews[index] == view)
                {
                    piece = trayPieces[index];
                    return piece != null;
                }
            }

            piece = null;
            return false;
        }

        public bool AreAllSlotsEmpty()
        {
            for (int index = 0; index < trayPieces.Length; index++)
            {
                if (trayPieces[index] != null)
                {
                    return false;
                }
            }

            return true;
        }

        public void RefreshViews()
        {
            for (int index = 0; index < trayPieces.Length; index++)
            {
                if (trayPieces[index] == null)
                {
                    pieceViews[index].Hide();
                    continue;
                }

                pieceViews[index].Bind(trayPieces[index]);
            }
        }

        private RuntimePiece CreateRandomPiece()
        {
            PieceShapeData shape = shapeLibrary.GetRandomShape();
            if (shape == null)
            {
                Debug.LogError("Cannot create runtime piece because the shape library returned null.");
                return null;
            }

            return new RuntimePiece(shape, config.GetRandomPieceColor());
        }
    }
}
