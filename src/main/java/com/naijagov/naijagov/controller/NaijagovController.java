package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.model.PollingUnit;
import com.naijagov.naijagov.model.Ward;
import com.naijagov.naijagov.service.LocalGovService;
import com.naijagov.naijagov.service.PollingUnitService;
import com.naijagov.naijagov.service.WardService;

import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
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

  @GetMapping("/localgovs/{id}")
  public ModelAndView displayLocalGov(
    @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
    @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
    @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {
    return null;
  }

  @GetMapping("/localgov")
  public ModelAndView localGovs(
    @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
    @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
    @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {
      Pageable sortedPage = pageable;
      // initial page load, no params
      if (form.getLocalGovsPage() == null) {
        sortedPage = pageable;
      }
      // when header sort is clicked
      else if (sortBy.isPresent() && sortDirection.isPresent()) {
        sortedPage = PageRequest.of(form.getLocalGovsPage().getNumber(), form.getLocalGovsPage().getSize(), sortDirection.get(), sortBy.get());
      }
      // when navigation link is clicked
      else if (form.getLocalGovsPage() != null) {
        sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), form.getLocalGovsPage().getSort());
      }
      form.setLocalGovsPage(localGovService.listAllLocalGovs(sortedPage));
  
      mv.setViewName("localgovs");
      return mv;
  }

  @GetMapping("/wards")
  public ModelAndView wards(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {
    Pageable sortedPage = pageable;
    // initial page load, no params
    if (form.getWardsPage() == null) {
      sortedPage = pageable;
    }
    // when header sort is clicked
    else if (sortBy.isPresent() && sortDirection.isPresent()) {
      sortedPage = PageRequest.of(form.getWardsPage().getNumber(), form.getWardsPage().getSize(), sortDirection.get(), sortBy.get());
    }
    // when navigation link is clicked
    else if (form.getWardsPage() != null) {
      sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), form.getWardsPage().getSort());
    }
    form.setWardsPage(wardService.listAllWards(sortedPage));

    mv.setViewName("wards");
    return mv;
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
    // get pollingUnits for ward
    Pageable sortedPage = pageable;
    // initial page load, no params
    if (form.getWardPage() == null) {
      sortedPage = pageable;
    }
    // when header sort is clicked
    else if (sortBy.isPresent() && sortDirection.isPresent()){
      sortedPage = PageRequest.of(form.getWardPage().getNumber(), form.getWardPage().getSize(), sortDirection.get(), sortBy.get());
    }
    // when navigation link is clicked
    else if (form.getWardPage() != null){
      sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), form.getWardPage().getSort());
    }
    form.setWardPage(pollingUnitService.getPollingUnits(pageable, wardObject));

    modelAndView.setViewName("ward");
    return modelAndView;
  }

  @GetMapping("/pollingunit/{id}")
  public ModelAndView displayPollingUnit(@PathVariable Integer id) {
    Optional<PollingUnit> optionalPu = pollingUnitService.findPollingUnit(id);
    ModelAndView modelAndView = new ModelAndView();
    if (optionalPu.isPresent()){
      modelAndView.addObject(optionalPu.get());
    }
    modelAndView.setViewName("pollingunit");
    return modelAndView;
  }

  @GetMapping("/pollingunits")
  public ModelAndView pollingUnits(
      @PageableDefault(size = 10, sort = "fullCode", direction = Sort.Direction.ASC) Pageable pageable,
      @ModelAttribute Form form, ModelAndView mv, @RequestParam("sortBy") Optional<String> sortBy,
      @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection) {
    Pageable sortedPage = pageable;
    // initial page load, no params
    if (form.getPollingUnitsPage() == null) {
      sortedPage = pageable;
    }
    // when header sort is clicked
    else if (sortBy.isPresent() && sortDirection.isPresent()){
      sortedPage = PageRequest.of(form.getPollingUnitsPage().getNumber(), form.getPollingUnitsPage().getSize(), sortDirection.get(), sortBy.get());
    }
    // when navigation link is clicked
    else if (form.getPollingUnitsPage() != null){
      sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), form.getPollingUnitsPage().getSort());
    }
    form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(sortedPage));

    mv.setViewName("pollingunits");
    return mv;
  }

  @ModelAttribute
  public Form form() {
    return new Form();
  }

  @Autowired
  public NaijagovController(PollingUnitService pollingUnitService, WardService wardService, LocalGovService localGovService) {
    this.pollingUnitService = pollingUnitService;
    this.wardService = wardService;
    this.localGovService = localGovService;
  }
}