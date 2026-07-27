#if UNITY_EDITOR
using System.Collections.Generic;
using BlockPlus.Data;
using UnityEditor;
using UnityEngine;

namespace BlockPlus.Editor
{
    public static class PieceShapeLibrarySeeder
    {
        private const string RootFolder = "Assets/BlockPlusGenerated";
        private const string ShapesFolder = RootFolder + "/Shapes";
        private const string LibraryAssetPath = RootFolder + "/PieceShapeLibrary.asset";

        [MenuItem("Tools/Block Plus/Generate Default Shape Library")]
        public static void Generate()
        {
            EnsureFolder("Assets", "BlockPlusGenerated");
            EnsureFolder(RootFolder, "Shapes");

            var createdShapes = new List<PieceShapeData>();
            for (int index = 0; index < ShapeDefinitions.Length; index++)
            {
                PieceShapeDefinition definition = ShapeDefinitions[index];
                string assetPath = $"{ShapesFolder}/{definition.Name}.asset";
                PieceShapeData asset = AssetDatabase.LoadAssetAtPath<PieceShapeData>(assetPath);

                if (asset == null)
                {
                    asset = ScriptableObject.CreateInstance<PieceShapeData>();
                    AssetDatabase.CreateAsset(asset, assetPath);
                }

                List<Vector2Int> cells = ConvertCells(definition.RowColumnCells);
                Vector2Int pivot = CalculatePivot(cells);
                asset.SetEditorData(definition.Name, cells, pivot);
                EditorUtility.SetDirty(asset);
                createdShapes.Add(asset);
            }

            PieceShapeLibrary library = AssetDatabase.LoadAssetAtPath<PieceShapeLibrary>(LibraryAssetPath);
            if (library == null)
            {
                library = ScriptableObject.CreateInstance<PieceShapeLibrary>();
                AssetDatabase.CreateAsset(library, LibraryAssetPath);
            }

            library.SetEditorShapes(createdShapes);
            EditorUtility.SetDirty(library);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Selection.activeObject = library;
            Debug.Log("Default Block Plus shape library generated.");
        }

        private static void EnsureFolder(string parent, string child)
        {
            string targetPath = $"{parent}/{child}";
            if (!AssetDatabase.IsValidFolder(targetPath))
            {
                AssetDatabase.CreateFolder(parent, child);
            }
        }

        private static List<Vector2Int> ConvertCells(Vector2Int[] rowColumnCells)
        {
            var cells = new List<Vector2Int>(rowColumnCells.Length);

            for (int index = 0; index < rowColumnCells.Length; index++)
            {
                Vector2Int rowColumn = rowColumnCells[index];
                cells.Add(new Vector2Int(rowColumn.y, rowColumn.x));
            }

            return cells;
        }

        private static Vector2Int CalculatePivot(List<Vector2Int> cells)
        {
            int minX = int.MaxValue;
            int maxX = int.MinValue;
            int minY = int.MaxValue;
            int maxY = int.MinValue;

            for (int index = 0; index < cells.Count; index++)
            {
                Vector2Int cell = cells[index];
                minX = Mathf.Min(minX, cell.x);
                maxX = Mathf.Max(maxX, cell.x);
                minY = Mathf.Min(minY, cell.y);
                maxY = Mathf.Max(maxY, cell.y);
            }

            return new Vector2Int(Mathf.RoundToInt((minX + maxX) * 0.5f), Mathf.RoundToInt((minY + maxY) * 0.5f));
        }

        private struct PieceShapeDefinition
        {
            public PieceShapeDefinition(string name, Vector2Int[] rowColumnCells)
            {
                Name = name;
                RowColumnCells = rowColumnCells;
            }

            public string Name { get; }
            public Vector2Int[] RowColumnCells { get; }
        }

        private static readonly PieceShapeDefinition[] ShapeDefinitions =
        {
            new PieceShapeDefinition("Single", new[] { new Vector2Int(0, 0) }),
            new PieceShapeDefinition("DominoHorizontal", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1) }),
            new PieceShapeDefinition("DominoVertical", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0) }),
            new PieceShapeDefinition("Line3Horizontal", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2) }),
            new PieceShapeDefinition("Line3Vertical", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(2, 0) }),
            new PieceShapeDefinition("Square2", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(1, 0), new Vector2Int(1, 1) }),
            new PieceShapeDefinition("L4A", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(2, 0), new Vector2Int(2, 1) }),
            new PieceShapeDefinition("L4B", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(1, 0), new Vector2Int(2, 0) }),
            new PieceShapeDefinition("L4C", new[] { new Vector2Int(0, 1), new Vector2Int(1, 1), new Vector2Int(2, 0), new Vector2Int(2, 1) }),
            new PieceShapeDefinition("L4D", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 0) }),
            new PieceShapeDefinition("L4E", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 2) }),
            new PieceShapeDefinition("T4A", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 1) }),
            new PieceShapeDefinition("T4B", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(1, 1), new Vector2Int(2, 0) }),
            new PieceShapeDefinition("Z4A", new[] { new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 0), new Vector2Int(1, 1) }),
            new PieceShapeDefinition("Z4B", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(1, 1), new Vector2Int(1, 2) }),
            new PieceShapeDefinition("Plus5", new[] { new Vector2Int(0, 1), new Vector2Int(1, 0), new Vector2Int(1, 1), new Vector2Int(1, 2), new Vector2Int(2, 1) }),
            new PieceShapeDefinition("Line4Horizontal", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(0, 3) }),
            new PieceShapeDefinition("Line4Vertical", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(2, 0), new Vector2Int(3, 0) }),
            new PieceShapeDefinition("MiniL3A", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(1, 0) }),
            new PieceShapeDefinition("MiniL3B", new[] { new Vector2Int(0, 1), new Vector2Int(1, 0), new Vector2Int(1, 1) }),
            new PieceShapeDefinition("Square3", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 0), new Vector2Int(1, 1), new Vector2Int(1, 2), new Vector2Int(2, 0), new Vector2Int(2, 1), new Vector2Int(2, 2) }),
            new PieceShapeDefinition("Rect2x3", new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2), new Vector2Int(1, 0), new Vector2Int(1, 1), new Vector2Int(1, 2) }),
            new PieceShapeDefinition("U5", new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(2, 0), new Vector2Int(0, 1), new Vector2Int(2, 1) }),
        };
    }
}
#endif
