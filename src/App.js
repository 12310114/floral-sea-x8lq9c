import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import _ from "lodash";
import * as d3 from "d3";

// 示例数据（当无法加载CSV文件时使用）
const SAMPLE_DATA = [
  { Keywords: "机器学习; 人工智能; 深度学习" },
  { Keywords: "人工智能; 神经网络; 强化学习" },
  { Keywords: "深度学习; 计算机视觉; 图像识别" },
  { Keywords: "自然语言处理; 机器学习; 深度学习" },
  { Keywords: "大数据; 数据挖掘; 人工智能" },
  { Keywords: "强化学习; 深度学习; 马尔可夫决策过程" },
  { Keywords: "计算机视觉; 卷积神经网络; 深度学习" },
  { Keywords: "知识图谱; 自然语言处理; 语义网" },
  { Keywords: "推荐系统; 协同过滤; 机器学习" },
  { Keywords: "图神经网络; 深度学习; 图算法" },
  { Keywords: "迁移学习; 深度学习; 域适应" },
  { Keywords: "情感分析; 自然语言处理; 机器学习" },
  { Keywords: "机器翻译; 自然语言处理; 注意力机制" },
  { Keywords: "语音识别; 深度学习; 隐马尔可夫模型" },
  { Keywords: "图像分割; 计算机视觉; 深度学习" },
];

// Nature杂志风格的配色方案
const NATURE_COLORS = [
  "#2171b5",
  "#6baed6",
  "#bdd7e7", // 蓝色系列
  "#238b45",
  "#74c476",
  "#bae4b3", // 绿色系列
  "#88419d",
  "#8c6bb1",
  "#d4b9da", // 紫色系列
  "#cb181d",
  "#fb6a4a",
  "#fcbba1", // 红色系列
  "#636363",
  "#969696",
  "#d9d9d9", // 灰色系列
];

// 社区检测算法 (基于Louvain算法的简化版)
const detectCommunities = (nodes, links) => {
  // 为简化，这里使用一个基于连接强度的聚类方法
  const communities = {};
  const nodeMap = {};

  // 初始化：每个节点自成一个社区
  nodes.forEach((node, i) => {
    communities[node.id] = i;
    nodeMap[node.id] = node;
  });

  // 按照连接强度合并社区
  const sortedLinks = [...links].sort((a, b) => b.value - a.value);

  sortedLinks.forEach((link) => {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;

    // 如果两个节点属于不同社区，考虑合并
    if (communities[sourceId] !== communities[targetId]) {
      // 对于较强的连接，合并社区
      if (link.value > 2) {
        const oldCommunity = communities[targetId];
        const newCommunity = communities[sourceId];

        // 更新所有属于旧社区的节点
        Object.keys(communities).forEach((nodeId) => {
          if (communities[nodeId] === oldCommunity) {
            communities[nodeId] = newCommunity;
          }
        });
      }
    }
  });

  // 重新映射社区ID为连续数字
  const uniqueCommunities = [...new Set(Object.values(communities))];
  const communityMap = {};
  uniqueCommunities.forEach((comm, i) => {
    communityMap[comm] = i;
  });

  // 更新节点的社区ID
  nodes.forEach((node) => {
    node.community = communityMap[communities[node.id]];
  });

  return nodes;
};

const KeywordNetworkViz = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keywordData, setKeywordData] = useState([]);
  const [networkData, setNetworkData] = useState({ nodes: [], links: [] });
  const [totalPapers, setTotalPapers] = useState(0);
  const [minLinkStrength, setMinLinkStrength] = useState(1);
  const [maxKeywords, setMaxKeywords] = useState(50);
  const [usingFile, setUsingFile] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [visualStyle, setVisualStyle] = useState("nature"); // 'nature', 'classic', 'dark'
  const [layoutType, setLayoutType] = useState("force"); // 'force', 'radial', 'cluster'
  const [selectedNode, setSelectedNode] = useState(null);
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const simulationRef = useRef(null);

  // 处理文件上传
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileData = e.target.result;
        processCSVData(fileData);
      } catch (err) {
        setError(`读取文件时出错: ${err.message}`);
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError("文件读取失败");
      setLoading(false);
    };

    reader.readAsText(file);
  };

  // 初始加载示例数据
  useEffect(() => {
    processSampleData();
  }, []);

  // 处理示例数据
  const processSampleData = () => {
    setTotalPapers(SAMPLE_DATA.length);
    const keywords = extractKeywords(SAMPLE_DATA);
    const { nodes, links } = buildNetworkData(
      keywords,
      maxKeywords,
      minLinkStrength
    );
    setNetworkData({ nodes, links });
    setKeywordData(keywords);
  };

  // 处理CSV数据
  const processCSVData = (fileData) => {
    Papa.parse(fileData, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const papers = results.data;
        setTotalPapers(papers.length);
        const keywords = extractKeywords(papers);
        const { nodes, links } = buildNetworkData(
          keywords,
          maxKeywords,
          minLinkStrength
        );
        setNetworkData({ nodes, links });
        setKeywordData(keywords);
        setUsingFile(true);
        setLoading(false);
      },
      error: (error) => {
        setError(`解析CSV时出错: ${error.message}`);
        setLoading(false);
      },
    });
  };

  // 提取关键词和共现关系
  const extractKeywords = (papers) => {
    // 计算每个关键词的频率
    let keywordFreq = {};
    // 计算关键词对之间的共现频率
    let cooccurrenceMatrix = {};

    papers.forEach((paper) => {
      if (!paper.Keywords) return;

      let keywords = [];
      // 尝试多种可能的分隔符
      const separators = [";", ",", "，", "、"];
      let foundSeparator = false;

      for (const sep of separators) {
        if (paper.Keywords.includes(sep)) {
          keywords = paper.Keywords.split(sep)
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
          foundSeparator = true;
          break;
        }
      }

      // 如果没有找到分隔符，则整个字符串视为一个关键词
      if (!foundSeparator && paper.Keywords.trim().length > 0) {
        keywords = [paper.Keywords.trim()];
      }

      // 更新关键词频率
      keywords.forEach((keyword) => {
        keywordFreq[keyword] = (keywordFreq[keyword] || 0) + 1;
      });

      // 更新共现矩阵
      for (let i = 0; i < keywords.length; i++) {
        for (let j = i + 1; j < keywords.length; j++) {
          const pair = [keywords[i], keywords[j]].sort().join("|||");
          cooccurrenceMatrix[pair] = (cooccurrenceMatrix[pair] || 0) + 1;
        }
      }
    });

    // 将关键词数据转换为数组格式
    const keywordArray = Object.entries(keywordFreq).map(
      ([keyword, count]) => ({
        keyword,
        count,
        percentage: (count / papers.length) * 100,
      })
    );

    // 按计数排序
    const sortedKeywords = keywordArray.sort((a, b) => b.count - a.count);

    // 计算并添加每个关键词的连接信息
    sortedKeywords.forEach((item) => {
      item.connections = [];

      Object.entries(cooccurrenceMatrix).forEach(([pair, strength]) => {
        const [kw1, kw2] = pair.split("|||");
        if (kw1 === item.keyword || kw2 === item.keyword) {
          const otherKeyword = kw1 === item.keyword ? kw2 : kw1;
          item.connections.push({
            keyword: otherKeyword,
            strength: strength,
          });
        }
      });

      // 按连接强度排序
      item.connections.sort((a, b) => b.strength - a.strength);
    });

    return sortedKeywords;
  };

  // 构建网络图数据
  const buildNetworkData = (keywordData, maxNodes, minStrength) => {
    // 选择最常见的N个关键词
    const topKeywords = keywordData.slice(0, maxNodes);
    const topKeywordSet = new Set(topKeywords.map((k) => k.keyword));

    // 创建节点
    const nodes = topKeywords.map((item) => ({
      id: item.keyword,
      count: item.count,
      connections: item.connections,
    }));

    // 创建边
    let links = [];
    topKeywords.forEach((source) => {
      source.connections.forEach((conn) => {
        // 只保留在顶部关键词列表中的连接，并且强度大于等于最小阈值
        if (topKeywordSet.has(conn.keyword) && conn.strength >= minStrength) {
          links.push({
            source: source.keyword,
            target: conn.keyword,
            value: conn.strength,
          });
        }
      });
    });

    // 去重（因为每个连接会被计算两次）
    links = _.uniqWith(
      links,
      (a, b) =>
        (a.source === b.source && a.target === b.target) ||
        (a.source === b.target && a.target === b.source)
    );

    // 检测社区
    const nodesWithCommunities = detectCommunities(nodes, links);

    return { nodes: nodesWithCommunities, links };
  };

  // 当筛选条件更改时，重新构建网络数据
  useEffect(() => {
    if (keywordData.length > 0) {
      const { nodes, links } = buildNetworkData(
        keywordData,
        maxKeywords,
        minLinkStrength
      );
      setNetworkData({ nodes, links });
    }
  }, [maxKeywords, minLinkStrength, keywordData]);

  // 下载SVG图表
  const downloadSVG = () => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    // 创建一个克隆，以便我们可以修改它而不影响显示
    const svgClone = svgElement.cloneNode(true);

    // 设置白色背景，以便在下载后更好地查看
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", "white");
    svgClone.insertBefore(rect, svgClone.firstChild);

    // 添加样式
    const style = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style"
    );
    style.textContent = `
      .link { stroke-opacity: 0.6; }
      .node text { font-family: Arial, sans-serif; }
      .node circle { stroke-width: 1.5px; }
    `;
    svgClone.appendChild(style);

    // 添加标题和描述
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title"
    );
    title.textContent = "关键词网络图";
    svgClone.appendChild(title);

    const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
    desc.textContent = `基于${totalPapers}篇论文的关键词网络分析`;
    svgClone.appendChild(desc);

    // 转换为字符串
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgClone);

    // 添加XML声明和命名空间
    svgString = '<?xml version="1.0" standalone="no"?>\n' + svgString;

    // 创建下载链接
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyword_network.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 下载PNG图表
  const downloadPNG = () => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    // 获取SVG尺寸
    const bbox = svgElement.getBBox();
    const width = svgElement.width.baseVal.value || bbox.width;
    const height = svgElement.height.baseVal.value || bbox.height;

    // 创建Canvas元素
    const canvas = document.createElement("canvas");
    canvas.width = width * 2; // 提高分辨率
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2); // 提高分辨率

    // 转换SVG为图像并绘制到Canvas
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();

    // 转换SVG到Data URL
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = function () {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // 转换Canvas为PNG并下载
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = "keyword_network.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    img.src = url;
  };

  // 缩放状态
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRef = useRef(null);

  // 缩放函数
  const handleZoom = (factor) => {
    if (zoomRef.current) {
      const currentTransform = d3.zoomTransform(svgRef.current);
      const newScale = currentTransform.k * factor;

      // 限制缩放范围，避免过度缩放
      if (newScale >= 0.2 && newScale <= 8) {
        const svgElement = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth || 800;
        const height = 600;

        // 计算居中的缩放变换
        const transform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(newScale)
          .translate(-width / 2, -height / 2);

        // 应用变换，但不触发过渡动画
        svgElement.call(zoomRef.current.transform, transform);

        // 更新缩放级别状态
        setZoomLevel(newScale);
      }
    }
  };

  // 重置缩放
  const resetZoom = () => {
    if (zoomRef.current) {
      const svgElement = d3.select(svgRef.current);
      svgElement.call(zoomRef.current.transform, d3.zoomIdentity);
      setZoomLevel(1);
    }
  };

  // 渲染网络图
  useEffect(() => {
    if (!svgRef.current || networkData.nodes.length === 0) return;

    // 清除现有的图表
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = 600;

    // 创建主SVG容器
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    // 创建一个包含所有可缩放内容的组
    const container = svg.append("g").attr("class", "zoom-container");

    // 添加底层图案 - Nature风格的微妙网格
    svg
      .append("defs")
      .append("pattern")
      .attr("id", "grid")
      .attr("width", 20)
      .attr("height", 20)
      .attr("patternUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 20 0 L 0 0 0 20")
      .attr("fill", "none")
      .attr("stroke", "#f0f0f0")
      .attr("stroke-width", 0.5);

    // 背景矩形
    container
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", visualStyle === "dark" ? "#202025" : "#ffffff")
      .attr("fill", "url(#grid)");

    // 添加背景水印
    container
      .append("text")
      .attr("x", width - 200)
      .attr("y", height - 30)
      .attr("text-anchor", "end")
      .attr("font-family", "'Arial', sans-serif")
      .attr("font-size", "12px")
      .attr("fill", visualStyle === "dark" ? "#454550" : "#e5e5e5")
      .text(`关键词网络分析 · ${new Date().getFullYear()}`);

    // 定义缩放行为
    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 8]) // 设置缩放范围
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
        setZoomLevel(event.transform.k); // 更新缩放级别状态
      });

    // 应用缩放行为到SVG
    svg.call(zoom);

    // 存储缩放引用以便外部访问
    zoomRef.current = zoom;

    // 创建一个工具提示div
    const tooltip = d3
      .select(tooltipRef.current)
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", visualStyle === "dark" ? "#303040" : "white")
      .style("color", visualStyle === "dark" ? "#f0f0f0" : "#303030")
      .style(
        "border",
        visualStyle === "dark" ? "1px solid #505060" : "1px solid #ddd"
      )
      .style("border-radius", "6px")
      .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
      .style("padding", "12px")
      .style("font-family", "'Arial', sans-serif")
      .style("font-size", "14px")
      .style("max-width", "300px")
      .style("pointer-events", "none")
      .style("z-index", "10")
      .style("transition", "opacity 0.2s");

    // 计算节点大小比例
    const countExtent = d3.extent(networkData.nodes, (d) => d.count);
    const radiusScale = d3.scaleSqrt().domain(countExtent).range([5, 25]);

    // 颜色比例尺 - 基于社区ID
    const communities = [...new Set(networkData.nodes.map((d) => d.community))];
    const colorScale = d3
      .scaleOrdinal()
      .domain(communities)
      .range(NATURE_COLORS);

    // 计算边宽度比例
    const linkExtent = d3.extent(networkData.links, (d) => d.value);
    const linkWidthScale = d3.scaleLinear().domain(linkExtent).range([0.5, 4]);

    // 定义箭头marker
    svg
      .append("defs")
      .selectAll("marker")
      .data(["arrow"])
      .enter()
      .append("marker")
      .attr("id", (d) => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .attr("opacity", 0.5)
      .append("path")
      .attr("fill", visualStyle === "dark" ? "#a0a0a0" : "#999")
      .attr("d", "M0,-5L10,0L0,5");

    // 创建布局
    let simulation;

    if (layoutType === "radial") {
      // 径向布局
      simulation = d3
        .forceSimulation(networkData.nodes)
        .force(
          "link",
          d3
            .forceLink(networkData.links)
            .id((d) => d.id)
            .distance((d) => 100 / (d.value * 0.5))
        )
        .force("charge", d3.forceManyBody().strength(-100))
        .force(
          "x",
          d3
            .forceX()
            .strength(0.1)
            .x(width / 2)
        )
        .force(
          "y",
          d3
            .forceY()
            .strength(0.1)
            .y(height / 2)
        )
        .force(
          "collide",
          d3
            .forceCollide()
            .radius((d) => radiusScale(d.count) + 2)
            .strength(1)
        )
        .force(
          "radial",
          d3
            .forceRadial((d) => d.count * 3, width / 2, height / 2)
            .strength(0.8)
        );
    } else if (layoutType === "cluster") {
      // 聚类布局 - 同一社区的节点会聚集在一起
      simulation = d3
        .forceSimulation(networkData.nodes)
        .force(
          "link",
          d3
            .forceLink(networkData.links)
            .id((d) => d.id)
            .distance((d) => 100 / Math.sqrt(d.value))
        )
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force(
          "collide",
          d3
            .forceCollide()
            .radius((d) => radiusScale(d.count) + 5)
            .strength(0.9)
        )
        .force("cluster", (alpha) => {
          // 同一社区的节点相互吸引
          const centroids = {};

          // 计算每个社区的中心点
          networkData.nodes.forEach((d) => {
            if (!centroids[d.community]) {
              centroids[d.community] = { x: 0, y: 0, count: 0 };
            }
            centroids[d.community].x += d.x;
            centroids[d.community].y += d.y;
            centroids[d.community].count += 1;
          });

          // 计算质心
          Object.keys(centroids).forEach((community) => {
            centroids[community].x /= centroids[community].count;
            centroids[community].y /= centroids[community].count;
          });

          // 节点向其社区的质心移动
          networkData.nodes.forEach((d) => {
            const centroid = centroids[d.community];
            d.vx += (centroid.x - d.x) * alpha * 0.1;
            d.vy += (centroid.y - d.y) * alpha * 0.1;
          });
        });
    } else {
      // 标准力导向布局
      simulation = d3
        .forceSimulation(networkData.nodes)
        .force(
          "link",
          d3
            .forceLink(networkData.links)
            .id((d) => d.id)
            .distance((d) => 150 - d.value * 5)
        )
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force(
          "collide",
          d3
            .forceCollide()
            .radius((d) => radiusScale(d.count) + 10)
            .strength(0.7)
        );
    }

    // 存储模拟引用以便稍后访问
    simulationRef.current = simulation;

    // 创建曲线连接线
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(networkData.links)
      .join("path")
      .attr("stroke", (d) => {
        const sourceNode = networkData.nodes.find(
          (n) => n.id === d.source.id || n.id === d.source
        );
        const targetNode = networkData.nodes.find(
          (n) => n.id === d.target.id || n.id === d.target
        );
        if (
          sourceNode &&
          targetNode &&
          sourceNode.community === targetNode.community
        ) {
          return colorScale(sourceNode.community);
        }
        return visualStyle === "dark" ? "#404050" : "#bbb";
      })
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", (d) => linkWidthScale(d.value))
      .attr("fill", "none");

    // 添加节点组
    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(networkData.nodes)
      .join("g")
      .call(drag(simulation))
      .on("click", (event, d) => {
        setSelectedNode(selectedNode === d.id ? null : d.id);
      })
      .on("mouseover", function (event, d) {
        // 突出显示当前节点和相连的边
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("stroke", "#fff")
          .attr("stroke-width", 2);

        // 过滤连接到这个节点的链接
        const relatedLinks = networkData.links.filter(
          (l) =>
            l.source.id === d.id ||
            l.source === d.id ||
            l.target.id === d.id ||
            l.target === d.id
        );

        // 过滤直接连接的节点ID
        const connectedNodeIds = new Set();
        relatedLinks.forEach((l) => {
          const sourceId = l.source.id || l.source;
          const targetId = l.target.id || l.target;
          if (sourceId === d.id) connectedNodeIds.add(targetId);
          else connectedNodeIds.add(sourceId);
        });

        // 高亮连接的边
        link
          .transition()
          .duration(200)
          .attr("stroke-opacity", (l) => {
            const sourceId = l.source.id || l.source;
            const targetId = l.target.id || l.target;
            return sourceId === d.id || targetId === d.id ? 0.9 : 0.1;
          })
          .attr("stroke-width", (l) => {
            const sourceId = l.source.id || l.source;
            const targetId = l.target.id || l.target;
            return sourceId === d.id || targetId === d.id
              ? linkWidthScale(l.value) * 1.5
              : linkWidthScale(l.value) * 0.5;
          });

        // 调整其他节点的不透明度
        node
          .transition()
          .duration(200)
          .attr("opacity", (n) => {
            if (n.id === d.id) return 1;
            return connectedNodeIds.has(n.id) ? 0.9 : 0.2;
          });

        // 显示工具提示
        tooltip
          .style("visibility", "visible")
          .style("opacity", 0)
          .transition()
          .duration(200)
          .style("opacity", 1)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 20}px`);

        // 获取前5个最强连接
        const topConnections = [...d.connections]
          .sort((a, b) => b.strength - a.strength)
          .filter((c) => c.strength >= minLinkStrength)
          .slice(0, 5);

        tooltip.html(`
            <div style="font-weight:600;margin-bottom:6px;font-size:15px;border-bottom:1px solid ${
              visualStyle === "dark" ? "#505060" : "#eee"
            };padding-bottom:6px;">
              ${d.id}
            </div>
            <div style="margin:4px 0;display:flex;justify-content:space-between;font-size:13px;">
              <span>出现次数:</span> <span>${d.count}</span>
            </div>
            <div style="margin:4px 0;display:flex;justify-content:space-between;font-size:13px;">
              <span>社区ID:</span> <span>${d.community}</span>
            </div>
            <div style="margin:8px 0 4px;font-size:13px;opacity:0.8;">关联关键词:</div>
            <div style="font-size:12px;margin-left:8px;">
              ${topConnections
                .map(
                  (c) =>
                    `<div style="margin:3px 0;display:flex;justify-content:space-between;">
                  <span>${c.keyword}</span>
                  <span style="opacity:0.7;margin-left:8px;">关联强度: ${c.strength}</span>
                </div>`
                )
                .join("")}
            </div>
          `);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 20}px`);
      })
      .on("mouseout", function () {
        // 恢复原始样式
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("stroke", (d) => (d.id === selectedNode ? "#fff" : "none"))
          .attr("stroke-width", (d) => (d.id === selectedNode ? 2 : 0));

        // 恢复所有边和节点
        link
          .transition()
          .duration(200)
          .attr("stroke-opacity", 0.4)
          .attr("stroke-width", (d) => linkWidthScale(d.value));

        node.transition().duration(200).attr("opacity", 1);

        // 隐藏工具提示
        tooltip
          .transition()
          .duration(200)
          .style("opacity", 0)
          .on("end", () => tooltip.style("visibility", "hidden"));
      });

    // 添加节点圆
    node
      .append("circle")
      .attr("r", (d) => radiusScale(d.count))
      .attr("fill", (d) => {
        // 使用渐变
        const color = colorScale(d.community);
        const darker = d3.rgb(color).darker(0.5).toString();
        const id = `gradient-${d.id.replace(/\s+/g, "-")}`;

        // 创建径向渐变
        const gradient = svg
          .append("defs")
          .append("radialGradient")
          .attr("id", id)
          .attr("cx", "30%")
          .attr("cy", "30%")
          .attr("r", "70%")
          .attr("fx", "30%")
          .attr("fy", "30%");

        gradient
          .append("stop")
          .attr("offset", "0%")
          .attr("stop-color", d3.rgb(color).brighter(0.2));

        gradient
          .append("stop")
          .attr("offset", "100%")
          .attr("stop-color", darker);

        return `url(#${id})`;
      })
      .attr("stroke", (d) => (d.id === selectedNode ? "#fff" : "none"))
      .attr("stroke-width", (d) => (d.id === selectedNode ? 2 : 0))
      .style("filter", "url(#glow)");

    // 添加发光效果
    const defs = svg.append("defs");

    const filter = defs
      .append("filter")
      .attr("id", "glow")
      .attr("height", "130%");

    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", "2")
      .attr("result", "coloredBlur");

    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // 添加节点标签
    if (showLabels) {
      // 创建白色背景板
      node
        .append("text")
        .attr("dx", (d) => radiusScale(d.count) + 2)
        .attr("dy", 4)
        .attr("font-family", "'Arial', sans-serif")
        .attr("font-size", (d) => Math.max(10, Math.min(14, 10 + d.count / 5)))
        .attr("font-weight", (d) =>
          d.count > (countExtent[1] - countExtent[0]) / 2 ? 600 : 400
        )
        .text((d) => d.id)
        .attr("fill", visualStyle === "dark" ? "#eeeeee" : "#333333")
        .attr("stroke", visualStyle === "dark" ? "#202025" : "#ffffff")
        .attr("stroke-width", 4)
        .attr("stroke-linejoin", "round")
        .attr("paint-order", "stroke")
        .attr("opacity", 0.9);

      // 添加实际文本
      node
        .append("text")
        .attr("dx", (d) => radiusScale(d.count) + 2)
        .attr("dy", 4)
        .attr("font-family", "'Arial', sans-serif")
        .attr("font-size", (d) => Math.max(10, Math.min(14, 10 + d.count / 5)))
        .attr("font-weight", (d) =>
          d.count > (countExtent[1] - countExtent[0]) / 2 ? 600 : 400
        )
        .text((d) => d.id)
        .attr("fill", (d) => d3.rgb(colorScale(d.community)).darker(0.8));
    }

    // 添加曲线路径
    simulation.on("tick", () => {
      link.attr("d", (d) => {
        const sourceX = d.source.x;
        const sourceY = d.source.y;
        const targetX = d.target.x;
        const targetY = d.target.y;

        // 使用二次曲线
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const dr = Math.sqrt(dx * dx + dy * dy) * 2;

        return `M${sourceX},${sourceY}A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
      });

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // 添加图例（固定位置，不随缩放变化）
    const legendSize = 12;
    const legendSpacing = 6;
    const legendX = 30;
    const legendY = 30;

    const legend = svg
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${legendX},${legendY})`)
      .style("pointer-events", "none"); // 避免与缩放交互

    // 背景面板
    legend
      .append("rect")
      .attr("x", -10)
      .attr("y", -15)
      .attr("width", 180)
      .attr("height", communities.length * (legendSize + legendSpacing) + 25)
      .attr(
        "fill",
        visualStyle === "dark" ? "rgba(40,40,50,0.8)" : "rgba(255,255,255,0.9)"
      )
      .attr("stroke", visualStyle === "dark" ? "#505060" : "#e0e0e0")
      .attr("stroke-width", 1)
      .attr("rx", 5);

    // 标题
    legend
      .append("text")
      .attr("x", 0)
      .attr("y", 0)
      .attr("font-family", "'Arial', sans-serif")
      .attr("font-size", 13)
      .attr("font-weight", 600)
      .attr("fill", visualStyle === "dark" ? "#f0f0f0" : "#333")
      .text("主题社区");

    // 图例项
    const legendItems = legend
      .selectAll(".legend-item")
      .data(communities)
      .enter()
      .append("g")
      .attr("class", "legend-item")
      .attr(
        "transform",
        (d, i) => `translate(0,${i * (legendSize + legendSpacing) + 15})`
      );

    legendItems
      .append("rect")
      .attr("width", legendSize)
      .attr("height", legendSize)
      .attr("rx", legendSize / 2)
      .attr("fill", (d) => colorScale(d));

    legendItems
      .append("text")
      .attr("x", legendSize + 6)
      .attr("y", legendSize / 2)
      .attr("dy", "0.35em")
      .attr("font-family", "'Arial', sans-serif")
      .attr("font-size", 12)
      .attr("fill", visualStyle === "dark" ? "#e0e0e0" : "#505050")
      .text(
        (d) =>
          `社区 ${d} (${
            networkData.nodes.filter((n) => n.community === d).length
          } 节点)`
      );

    // 在第一次渲染后让图形"冷却"
    setTimeout(() => {
      simulation.alphaTarget(0);
    }, 3000);

    // 定义拖拽行为
    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  }, [
    networkData,
    showLabels,
    visualStyle,
    layoutType,
    selectedNode,
    minLinkStrength,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">加载中...</div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 ${
        visualStyle === "dark"
          ? "bg-gray-900 text-gray-100"
          : "bg-white text-gray-800"
      }`}
    >
      <h1 className="text-2xl font-bold mb-4">论文关键词网络关系图</h1>

      {/* 文件上传区域 */}
      <div
        className={`mb-6 p-4 border rounded ${
          visualStyle === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <h2 className="text-lg font-semibold mb-2">数据来源</h2>
        {usingFile ? (
          <div className="text-green-600 mb-2">✓ 已成功加载CSV文件数据</div>
        ) : (
          <div
            className={`mb-2 ${
              error
                ? "text-red-600"
                : visualStyle === "dark"
                ? "text-gray-300"
                : "text-gray-600"
            }`}
          >
            {error ? error : "当前显示示例数据，请上传CSV文件进行分析"}
          </div>
        )}

        <div className="flex items-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
          >
            选择CSV文件
          </button>
          <span
            className={`ml-2 text-sm ${
              visualStyle === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            请选择包含Keywords列的CSV文件
          </span>
        </div>
      </div>

      <p
        className={`mb-4 ${
          visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {usingFile
          ? `基于 ${totalPapers} 篇论文的关键词网络图，节点大小表示关键词出现频率，节点颜色表示主题社区，连线粗细表示关联强度。`
          : `示例数据：关键词网络关系可视化（节点大小表示出现频率，节点颜色表示主题社区，连线粗细表示关联强度）`}
      </p>

      {/* 控制面板 */}
      <div
        className={`mb-6 p-4 border rounded flex flex-wrap gap-6 ${
          visualStyle === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
            }`}
          >
            显示关键词数量:
          </label>
          <select
            value={maxKeywords}
            onChange={(e) => setMaxKeywords(Number(e.target.value))}
            className={`p-2 border rounded ${
              visualStyle === "dark"
                ? "bg-gray-700 border-gray-600 text-gray-200"
                : "bg-white border-gray-300"
            }`}
          >
            <option value={20}>20个关键词</option>
            <option value={30}>30个关键词</option>
            <option value={50}>50个关键词</option>
            <option value={100}>100个关键词</option>
          </select>
        </div>

        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
            }`}
          >
            最小连接强度:
          </label>
          <select
            value={minLinkStrength}
            onChange={(e) => setMinLinkStrength(Number(e.target.value))}
            className={`p-2 border rounded ${
              visualStyle === "dark"
                ? "bg-gray-700 border-gray-600 text-gray-200"
                : "bg-white border-gray-300"
            }`}
          >
            <option value={1}>1 (显示所有连接)</option>
            <option value={2}>2 (中等强度)</option>
            <option value={3}>3 (仅强连接)</option>
            <option value={5}>5 (非常强连接)</option>
          </select>
        </div>

        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
            }`}
          >
            布局方式:
          </label>
          <select
            value={layoutType}
            onChange={(e) => setLayoutType(e.target.value)}
            className={`p-2 border rounded ${
              visualStyle === "dark"
                ? "bg-gray-700 border-gray-600 text-gray-200"
                : "bg-white border-gray-300"
            }`}
          >
            <option value="force">力导向布局</option>
            <option value="radial">径向布局</option>
            <option value="cluster">聚类布局</option>
          </select>
        </div>

        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
            }`}
          >
            显示标签:
          </label>
          <div className="flex items-center mt-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={() => setShowLabels(!showLabels)}
              className="h-4 w-4 text-blue-600"
            />
            <span
              className={`ml-2 ${
                visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {showLabels ? "显示关键词文本" : "隐藏关键词文本"}
            </span>
          </div>
        </div>

        <div>
          <label
            className={`block text-sm font-medium mb-1 ${
              visualStyle === "dark" ? "text-gray-300" : "text-gray-700"
            }`}
          >
            视觉风格:
          </label>
          <select
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
            className={`p-2 border rounded ${
              visualStyle === "dark"
                ? "bg-gray-700 border-gray-600 text-gray-200"
                : "bg-white border-gray-300"
            }`}
          >
            <option value="nature">Nature风格</option>
            <option value="classic">经典</option>
            <option value="dark">暗色模式</option>
          </select>
        </div>
      </div>

      {/* 图表区域 */}
      <div
        className={`border rounded p-4 mb-4 ${
          visualStyle === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="flex justify-between items-center mb-4">
          <div
            className={`text-sm ${
              visualStyle === "dark" ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <span className="font-medium">操作提示:</span>{" "}
            将鼠标悬停在节点上可查看详细信息，拖动节点可调整位置，点击节点可固定选中
          </div>

          {/* 下载和缩放按钮 */}
          <div className="flex gap-2">
            <button
              onClick={downloadSVG}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
              title="下载SVG矢量图"
            >
              下载SVG
            </button>
            <button
              onClick={downloadPNG}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
              title="下载PNG位图"
            >
              下载PNG
            </button>

            <div
              className={`flex items-center gap-1 px-2 py-1 ml-2 rounded border ${
                visualStyle === "dark"
                  ? "border-gray-600 bg-gray-700"
                  : "border-gray-300 bg-gray-100"
              }`}
            >
              <button
                onClick={() => handleZoom(0.8)}
                className={`w-6 h-6 flex items-center justify-center rounded ${
                  visualStyle === "dark"
                    ? "hover:bg-gray-600 text-gray-200"
                    : "hover:bg-gray-200 text-gray-700"
                }`}
                title="缩小"
              >
                -
              </button>
              <span
                className={`text-xs mx-1 ${
                  visualStyle === "dark" ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => handleZoom(1.25)}
                className={`w-6 h-6 flex items-center justify-center rounded ${
                  visualStyle === "dark"
                    ? "hover:bg-gray-600 text-gray-200"
                    : "hover:bg-gray-200 text-gray-700"
                }`}
                title="放大"
              >
                +
              </button>
              <button
                onClick={resetZoom}
                className={`text-xs px-1 ml-1 rounded ${
                  visualStyle === "dark"
                    ? "hover:bg-gray-600 text-gray-300"
                    : "hover:bg-gray-200 text-gray-600"
                }`}
                title="重置缩放"
              >
                重置
              </button>
            </div>

            {simulationRef.current && (
              <button
                onClick={() => {
                  if (simulationRef.current) {
                    simulationRef.current.alpha(0.3).restart();
                  }
                }}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded"
                title="重新计算节点位置"
              >
                重新布局
              </button>
            )}
          </div>
        </div>

        <div className="w-full relative">
          <svg
            ref={svgRef}
            width="100%"
            height="600"
            className={`border rounded ${
              visualStyle === "dark" ? "bg-gray-900" : "bg-gray-50"
            }`}
          ></svg>
          <div ref={tooltipRef}></div>
        </div>
      </div>

      <div
        className={`mt-4 text-sm ${
          visualStyle === "dark" ? "text-gray-400" : "text-gray-500"
        }`}
      >
        <p>
          注：此网络图根据关键词在同一篇论文中出现的情况计算关联关系。节点大小表示该关键词出现频率，连线粗细表示两个关键词共同出现的频率。节点颜色表示算法检测出的主题社区。
        </p>
      </div>
    </div>
  );
};

export default KeywordNetworkViz;
