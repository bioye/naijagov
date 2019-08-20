package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.model.LocalGov;
import com.naijagov.naijagov.model.PollingUnit;
import com.naijagov.naijagov.model.Ward;
import com.naijagov.naijagov.service.LocalGovService;
import com.naijagov.naijagov.service.PollingUnitService;
import com.naijagov.naijagov.service.WardService;

import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttributes;
import org.springframework.web.servlet.ModelAndView;

@Controller
@SessionAttributes({ "form" })
public class NaijagovController {

  private PollingUnitService pollingUnitService;
  private WardService wardService;
  private LocalGovService localGovService;

  @ModelAttribute
  public Form form() {
    return new Form();
  }

  @Autowired
  public NaijagovController(PollingUnitService pollingUnitService, WardService wardService,
      LocalGovService localGovService) {
    this.pollingUnitService = pollingUnitService;
    this.wardService = wardService;
    this.localGovService = localGovService;
  }

  @GetMapping("/localgovs")
  public ModelAndView localGovs(
      @PageableDefault(size = 10, sort = "code", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getLocalGovsPage(), pageable, sortBy, sortDirection);
    form.setLocalGovsPage(localGovService.listAllLocalGovs(sortedPage));
    mv.setViewName("localgovs");
    return mv;
  }

  @GetMapping("/wards")
  public ModelAndView wards(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getWardsPage(), pageable, sortBy, sortDirection);
    form.setWardsPage(wardService.listAllWards(sortedPage));
    mv.setViewName("wards");
    return mv;
  }

  @GetMapping("/pollingunits")
  public ModelAndView pollingUnits(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = getSortedPage(form.getPollingUnitsPage(), pageable, sortBy, sortDirection);
    form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(sortedPage));
    mv.setViewName("pollingunits");
    return mv;
  }

  @GetMapping("/localgov/{id}")
  public ModelAndView displayLocalGov(@PathVariable Integer id,
      @PageableDefault(size = 10, sort = "code", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Optional<LocalGov> optionalLocalGov = localGovService.findLocalGov(id);
    ModelAndView modelAndView = new ModelAndView();
    LocalGov localGovObject = null;
    if (optionalLocalGov.isPresent()) {
      localGovObject = optionalLocalGov.get();
      modelAndView.addObject(localGovObject);
    }
    Pageable sortedPage = getSortedPage(form.getLocalGovPage(), pageable, sortBy, sortDirection);
    form.setLocalGovPage(wardService.getWards(sortedPage, localGovObject));
    modelAndView.setViewName("localgov");
    return modelAndView;
  }

  @GetMapping("/ward/{id}")
  public ModelAndView displayWard(@PathVariable Integer id,
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {

    Optional<Ward> optionalWard = wardService.findWard(id);
    ModelAndView modelAndView = new ModelAndView();
    Ward wardObject = null;
    if (optionalWard.isPresent()) {
      // what's the significance of this?
      wardObject = optionalWard.get();
      modelAndView.addObject(wardObject);
    }
    Pageable sortedPage = getSortedPage(form.getWardPage(), pageable, sortBy, sortDirection);
    form.setWardPage(pollingUnitService.getPollingUnits(sortedPage, wardObject));
    modelAndView.setViewName("ward");
    return modelAndView;
  }

  @GetMapping("/pollingunit/{id}")
  public ModelAndView displayPollingUnit(@PathVariable Integer id) {
    return getConstituencyModelAndView(pollingUnitService.findPollingUnit(id), "pollingunit");
  }

  public ModelAndView getConstituencyModelAndView(Optional<?> constituency, String constituencyName) {
    ModelAndView modelAndView = new ModelAndView();
    if (constituency.isPresent()) {
      modelAndView.addObject(constituency.get());
    }
    modelAndView.setViewName(constituencyName);
    return modelAndView;
  }

  public Pageable getSortedPage(Page<?> page, Pageable pageable, Optional<String> sortBy,
      Optional<Sort.Direction> sortDirection) {

    Pageable sortedPage = pageable;
    // initial page load, no params
    if (page == null) {
      sortedPage = pageable;
    }
    // when header sort is clicked
    else if (sortBy.isPresent() && sortDirection.isPresent()) {
      sortedPage = PageRequest.of(page.getNumber(), page.getSize(), sortDirection.get(), sortBy.get());
    }
    // when navigation link is clicked
    else if (page != null) {
      sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), page.getSort());
    }
    return sortedPage;
  }
}
